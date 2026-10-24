// End-to-end tests (Phase 10, lesson 2): the real shop, the Compose one, with its API, its
// database, its queue, its worker and its email. Only fetch is used: what a client does.
// npm run e2e, with the shop running. If something fails here and not in the other tests, the
// problem is in how the pieces fit together, not in one of them.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { BASE_URL, MAILPIT_URL, ORIGIN, waitFor } from './helpers.ts';

const run = promisify(execFile);
const json = { 'Content-Type': 'application/json' };

test('a purchase from start to finish: session, order, payment and email', async () => {
  // Carmen's practice account, the one the development data loads (db/accounts.sql), and not a
  // new one: the shop allows 5 new accounts per IP per hour, and a reader who repeats this test
  // while learning would hit the limit. Creating an account is already covered by the
  // integration tests.
  const email = 'carmen@example.com';
  const password = 'carmen-practice-2026';

  const session = await fetch(`${BASE_URL}/v2/session`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password }),
  });
  assert.equal(session.status, 200);
  // Only "name=value" of the Set-Cookie goes back: the rest are instructions for the browser.
  const cookie = session.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie, 'the shop did not set the session cookie');

  const order = await fetch(`${BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: { ...json, Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify({ productId: 1, quantity: 1 }),
  });
  assert.equal(order.status, 201);
  const { id } = await order.json();

  // The payment is made by the fake gateway, the same one anyone following the lessons by hand
  // uses. It reads WEBHOOK_SECRET from Compose's .env, which is the one the API uses.
  const { stdout } = await run('npm', ['run', '--silent', 'gateway', '--', String(id)], {
    env: { ...process.env, SHOP_URL: BASE_URL },
  });
  assert.match(stdout, /← 2\d\d/);

  // The email doesn't leave at once: it goes through the queue and the worker sends it. We wait,
  // with a limit, instead of sleeping a fixed number of seconds (a test like that fails
  // sometimes, and nobody knows why). Carmen's inbox keeps the emails of earlier runs, so we look
  // for the one of the order we just paid, by the number in its subject.
  const messages = await waitFor('the confirmation email', async () => {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = await res.json();
    const ours = messages.filter(
      (m: { Subject: string }) => m.Subject === `Your order ${id} is paid`,
    );
    return ours.length > 0 ? ours : undefined;
  });
  assert.equal(messages.length, 1);
});

test('the shop answers on /health, and what does not exist is a 404 in Problem Details format', async () => {
  assert.equal((await fetch(`${BASE_URL}/health`)).status, 200);

  const res = await fetch(`${BASE_URL}/does-not-exist`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') ?? '', /application\/problem\+json/);
  assert.equal((await res.json()).status, 404);
});
