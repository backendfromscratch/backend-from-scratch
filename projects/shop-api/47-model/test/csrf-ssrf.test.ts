import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { otherSitePage } from '../scripts/other-site.ts';
import { app } from '../src/app.ts';
import { findOrder } from '../src/data.ts';
import { pool } from '../src/db.ts';
import { notifyOne } from '../src/notifications.ts';
import { checkUrl, postJson, type Resolver } from '../src/safe-url.ts';
import { sign } from '../src/signature.ts';
import { useDb } from './db.ts';
import { CARMEN, asDelivery, asUser } from './identities.ts';

// Carmen, a customer, with her session in the cookie; and the delivery company's key.
let carmen: Record<string, string>;
let delivery: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
  delivery = await asDelivery();
});

const OTHER_SITE = 'http://127.0.0.1:4000';

/** A fake resolver: each name, with the addresses it's told. Nothing goes out to DNS. */
const resolvingTo =
  (...addresses: string[]): Resolver =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

test("CSRF: another site's form with the session cookie: 403; from the shop, it passes", async () => {
  const form = (headers: Record<string, string>) =>
    app.request('/v2/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: carmen.Cookie!,
        ...headers,
      },
      body: 'productId=1&quantity=10',
    });
  const fromOutside = await form({ Origin: OTHER_SITE });
  assert.equal(fromOutside.status, 403);
  assert.equal(
    (await fromOutside.json()).detail,
    'The request comes from another site and uses your session: it is not accepted',
  );
  // Without Origin or Sec-Fetch-Site either: there's no knowing where it comes from.
  assert.equal((await form({})).status, 403);
  // From the shop itself it passes the check (and the route, which expects JSON, answers 415).
  assert.equal((await form({ Origin: 'http://localhost:3000' })).status, 415);
  assert.equal((await form({ 'Sec-Fetch-Site': 'same-origin' })).status, 415);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM orders WHERE quantity = 10');
  assert.equal(rows[0].n, 0, 'no order has been placed');
});

test('CSRF: cancelling with the cookie and without Origin, 403; with Bearer, which the browser does not add on its own, yes', async () => {
  // Order 21, pending, is Carmen's.
  const withCookie = await app.request('/v2/orders/21/cancellation', {
    method: 'POST',
    headers: { Cookie: carmen.Cookie! },
  });
  assert.equal(withCookie.status, 403);
  assert.equal((await findOrder(21))!.status, 'pending');
  const id = carmen.Cookie!.replace('session=', '');
  const withBearer = await app.request('/v2/orders/21/cancellation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${id}` },
  });
  assert.equal(withBearer.status, 200);
});

test('CSRF: a POST with JSON and the cookie does pass: another site cannot send it without CORS asking', async () => {
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: carmen.Cookie! },
    body: '{"productId":1,"quantity":1}',
  });
  assert.equal(res.status, 201);
});

test('scripts/other-site.ts: the page sends a form and a fetch to the shop', async () => {
  const page = String(await otherSitePage('http://localhost:3000'));
  assert.match(page, /<form method="post" action="http:\/\/localhost:3000\/v2\/orders">/);
  assert.match(page, /credentials: 'include'/);
});

test("SSRF: http, localhost, the cloud's metadata, a name that points to 127.0.0.1, ::1… rejected", async () => {
  const cases: [string, Resolver | undefined, RegExp][] = [
    ['http://localhost/notifications', undefined, /https:\/\//],
    ['http://169.254.169.254/latest/meta-data/', undefined, /https:\/\//],
    [
      'https://169.254.169.254/latest/meta-data/',
      undefined,
      /internal address \(169\.254\.169\.254\)/,
    ],
    [
      'https://notifications.trap.example/',
      resolvingTo('127.0.0.1'),
      /internal address \(127\.0\.0\.1\)/,
    ],
    ['https://half.trap.example/', resolvingTo('93.184.215.14', '10.0.0.5'), /internal/],
    ['https://[::1]/notifications', undefined, /internal address \(::1\)/],
    ['https://[::ffff:127.0.0.1]/', undefined, /internal/],
    ['https://[fd00::5]/', undefined, /internal/],
    ['https://192.168.1.1/', undefined, /internal/],
    ['https://ana:secret@delivery.example/', undefined, /user or a password/],
    ['not a url', undefined, /It is not a URL/],
  ];
  for (const [url, resolver, reason] of cases) {
    const result = await checkUrl(url, { resolver, devHosts: [] });
    assert.ok('error' in result, url);
    assert.match(result.error, reason, url);
  }
});

test('SSRF: a public address is accepted, and it is the one that will be connected to', async () => {
  const result = await checkUrl('https://delivery.example/notifications', {
    resolver: resolvingTo('93.184.215.14'),
    devHosts: [],
  });
  assert.ok(!('error' in result));
  assert.deepEqual(result.address, { address: '93.184.215.14', family: 4 });
  assert.equal(result.url.href, 'https://delivery.example/notifications');
});

/** A server on 127.0.0.1 that answers what it's told and records what it receives. */
async function testServer(
  respond: (request: IncomingMessage, body: string) => [number, Record<string, string>],
) {
  const received: { headers: IncomingMessage['headers']; body: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push({ headers: request.headers, body });
    const [status, headers] = respond(request, body);
    response.writeHead(status, headers).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://localhost:${(server.address() as AddressInfo).port}/notifications`;
  return { server, url, received };
}

// In development, localhost is allowed (devHosts), and the name is resolved right here.
const inDevelopment = { devHosts: ['localhost'], resolver: resolvingTo('127.0.0.1') };

test('SSRF: a redirect is not followed', async () => {
  const { server, url } = await testServer(() => [
    302,
    { Location: 'http://169.254.169.254/latest/meta-data/' },
  ]);
  try {
    const result = await postJson(url, '{}', {}, inDevelopment);
    assert.deepEqual(result, { error: 'It answers 302, a redirect: it is not followed' });
  } finally {
    server.close();
  }
});

test("a paid order's notification arrives signed at the delivery company's URL", async () => {
  const { server, url, received } = await testServer(() => [204, {}]);
  try {
    const { rows } = await pool.query('SELECT id FROM api_keys LIMIT 1');
    await pool.query(
      `INSERT INTO notifications (key_id, url, secret) VALUES ($1, $2, 'test-secret')`,
      [rows[0].id, url],
    );
    const order = (await findOrder(13))!;
    // Without allowing localhost, it doesn't go out: http and an internal address. It's a failure
    // (the queue retries it, Phase 9).
    await assert.rejects(notifyOne(rows[0].id, order, 'evt-1', { devHosts: [] }), /https/);
    assert.equal(received.length, 0);
    await notifyOne(rows[0].id, order, 'evt-1', inDevelopment);
    assert.equal(received.length, 1);
    const [{ headers, body }] = received as [(typeof received)[0]];
    assert.deepEqual(JSON.parse(body), { type: 'order.paid', order });
    assert.equal(headers['x-signature'], sign(body, 'test-secret'));
    assert.equal(headers['x-event-id'], 'evt-1');
  } finally {
    server.close();
    await pool.query('DELETE FROM notifications');
  }
});

test('PUT /v2/delivery/notification: the delivery key saves a public URL; an internal one, 422', async () => {
  const save = (headers: Record<string, string>, url: string) =>
    app.request('/v2/delivery/notification', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ url }),
    });
  // An address written as is: there's no need to ask DNS, nor is it connected to.
  const res = await save(delivery, 'https://93.184.215.14/notifications');
  assert.equal(res.status, 200);
  const { url, secret } = await res.json();
  assert.equal(url, 'https://93.184.215.14/notifications');
  assert.match(secret, /^[\w-]{43}$/);
  const { rows } = await pool.query('SELECT url, secret FROM notifications');
  assert.deepEqual(rows, [{ url, secret }]);

  const internal = await save(delivery, 'https://169.254.169.254/latest/meta-data/');
  assert.equal(internal.status, 422);
  assert.equal((await internal.json()).errors[0].field, 'url');
  assert.equal((await save(carmen, 'https://93.184.215.14/')).status, 403);
  assert.equal((await save({}, 'https://93.184.215.14/')).status, 401);
  await pool.query('DELETE FROM notifications');
});
