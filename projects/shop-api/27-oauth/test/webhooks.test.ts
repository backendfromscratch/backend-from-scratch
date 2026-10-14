import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { changeStatus, findOrder } from '../src/data.ts';
import { sign } from '../src/signature.ts';
import { useDb } from './db.ts';

useDb();

const run = promisify(execFile);

/** Creates a pending order and returns its id. */
async function newOrder(headers: Record<string, string> = {}): Promise<number> {
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{"productId":1,"quantity":1}',
  });
  return (await res.json()).id;
}

/** Sends a webhook with the body and the signature it's given. */
const notify = (body: string, signature?: string) =>
  app.request('/v2/webhooks/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'X-Signature': signature } : {}),
    },
    body,
  });

const event = (id: string, orderId: number) =>
  JSON.stringify({ id, type: 'payment.completed', orderId });

test('the signature: sha256= and 64 hexadecimal digits; it changes if a byte changes', () => {
  assert.match(sign('{"a":1}', 'secret'), /^sha256=[0-9a-f]{64}$/);
  assert.notEqual(sign('{"a":1}', 'secret'), sign('{"a":2}', 'secret'));
  assert.notEqual(sign('{"a":1}', 'secret'), sign('{"a":1}', 'another secret'));
});

test('a notification with the right signature: 200, and the order becomes paid', async () => {
  const id = await newOrder();
  const body = event('evt_1', id);
  const res = await notify(body, sign(body, config.WEBHOOK_SECRET));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: 'evt_1', repeated: false });
  assert.equal((await findOrder(id))!.status, 'paid');
});

test('the same event again: receipt is acknowledged, but it is not processed again', async () => {
  const id = await newOrder();
  const body = event('evt_2', id);
  const signature = sign(body, config.WEBHOOK_SECRET);
  await notify(body, signature);
  // In between, the order is cancelled: if the event were processed again, it shouldn't change.
  await changeStatus(id, 'cancelled');
  const res = await notify(body, signature);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: 'evt_2', repeated: true });
  assert.equal((await findOrder(id))!.status, 'cancelled');
});

test('a body changed on the way: 400, and the order does not change', async () => {
  const id = await newOrder();
  const original = event('evt_3', id - 1);
  const tampered = event('evt_3', id);
  const res = await notify(tampered, sign(original, config.WEBHOOK_SECRET));
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).type, 'https://shop.example/problems/invalid-signature');
  assert.equal((await findOrder(id))!.status, 'pending');
});

test('without a signature, or signed with another secret: 400', async () => {
  const body = event('evt_4', 1);
  assert.equal((await notify(body)).status, 400);
  assert.equal((await notify(body, sign(body, 'a-secret-that-is-not-the-right-one'))).status, 400);
  assert.equal((await notify(body, 'sha256=short')).status, 400);
});

test('well signed, but an invalid event or one for an order that does not exist: 422', async () => {
  const otherType = JSON.stringify({ id: 'evt_5', type: 'payment.refunded', orderId: 1 });
  const res = await notify(otherType, sign(otherType, config.WEBHOOK_SECRET));
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errors, [
    { field: 'type', problem: 'Only completed payments are accepted' },
  ]);
  const noOrder = event('evt_6', 999);
  const other = await notify(noOrder, sign(noOrder, config.WEBHOOK_SECRET));
  assert.equal(other.status, 422);
  assert.deepEqual((await other.json()).errors, [{ field: 'orderId', problem: 'No such order' }]);
});

test('Idempotency-Key: repeating the request returns the same response, without creating another order', async () => {
  const send = () =>
    app.request('/v2/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' },
      body: '{"productId":2,"quantity":3}',
    });
  const first = await send();
  const second = await send();
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.headers.get('idempotent-replayed'), null);
  assert.equal(second.headers.get('idempotent-replayed'), 'true');
  assert.equal(second.headers.get('location'), first.headers.get('location'));
  assert.deepEqual(await second.json(), await first.json());
  const next = await newOrder();
  assert.equal(next, Number(first.headers.get('location')!.split('/').at(-1)) + 1);
});

test('the replayed response carries the X-Request-Id of its own request', async () => {
  const send = () =>
    app.request('/v2/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-3' },
      body: '{"productId":1,"quantity":2}',
    });
  const first = await send();
  const second = await send();
  assert.equal(second.headers.get('idempotent-replayed'), 'true');
  // It's another request: its id is its own, not the first one's.
  const id = second.headers.get('x-request-id');
  assert.match(id ?? '', /^[0-9a-f-]{36}$/);
  assert.notEqual(id, first.headers.get('x-request-id'));
});

test('the same key with other data: 422', async () => {
  await newOrder({ 'Idempotency-Key': 'key-2' });
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-2' },
    body: '{"productId":3,"quantity":1}',
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).type, 'https://shop.example/problems/reused-key');
});

test('without an Idempotency-Key, each request creates an order', async () => {
  assert.notEqual(await newOrder(), await newOrder());
});

test('scripts/payment-gateway.ts: notifies, gets 400 with --tamper and repeated with --repeat', async () => {
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise((ready) => server.once('listening', ready));
  const env = {
    ...process.env,
    SHOP_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
  const gateway = (...args: string[]) =>
    run('node', ['scripts/payment-gateway.ts', ...args], { env });
  try {
    const id = await newOrder();
    const tampered = await gateway(String(id), '--tamper');
    assert.match(tampered.stdout, /^← 400 /m);
    assert.equal((await findOrder(id))!.status, 'pending');

    const repeated = await gateway(String(id), '--repeat');
    const responses = repeated.stdout.split('\n').filter((line) => line.startsWith('←'));
    assert.match(responses[0]!, /^← 200 .*"repeated":false/);
    assert.match(responses[1]!, /^← 200 .*"repeated":true/);
    assert.equal((await findOrder(id))!.status, 'paid');
  } finally {
    server.close();
  }
});
