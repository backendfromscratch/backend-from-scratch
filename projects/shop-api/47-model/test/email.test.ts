// The confirmation email (Phase 9, lesson 1), without a mail server: with Nodemailer, a JSON
// transport (jsonTransport) sends nothing, it only returns the message it would have sent.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { type AddressInfo, createServer, type Socket } from 'node:net';
import { mock, test } from 'node:test';
import { createTransport } from 'nodemailer';
import { findOrder } from '../src/data.ts';
import { makeTransport, sendConfirmation } from '../src/email.ts';
import { log } from '../src/log.ts';
import { useDb } from './db.ts';

useDb();

/** A transport that sends nothing, and the messages it would have sent. */
function testTransport() {
  const transport = createTransport({ jsonTransport: true });
  const send = mock.method(transport, 'sendMail');
  return {
    transport,
    async messages() {
      // What sendMail returns with jsonTransport: the message, as JSON, in message.
      const results = (await Promise.all(
        send.mock.calls.map((call) => call.result),
      )) as unknown as { message: string }[];
      return results.map((info) => JSON.parse(info.message));
    },
  };
}

test('without SMTP_URL, it sends nothing and says so in the log', async (t) => {
  const info = t.mock.method(log, 'info');
  // Order 21 is Carmen's: there's someone to write to, but nothing to write with (test/.env doesn't set SMTP_URL).
  const order = (await findOrder(21))!;
  assert.equal(await sendConfirmation(order), 'no-smtp');
  const [data, message] = info.mock.calls.at(-1)!.arguments as unknown as [object, string];
  assert.deepEqual(data, { orderId: 21 });
  assert.match(message, /no SMTP_URL/);
});

test('an order without a customer has no email', async () => {
  // The orders from before the accounts (Phase 6) belong to nobody.
  const { transport, messages } = testTransport();
  const order = { ...(await findOrder(21))!, customerId: null };
  assert.equal(await sendConfirmation(order, transport), 'no-customer');
  assert.deepEqual(await messages(), []);
});

test("the email goes to the customer's address, with the order number", async () => {
  const { transport, messages } = testTransport();
  const order = (await findOrder(21))!;
  assert.equal(await sendConfirmation(order, transport), 'sent');
  const [message, ...others] = await messages();
  assert.deepEqual(others, []);
  assert.deepEqual(
    message.to.map((to: { address: string }) => to.address),
    ['carmen@example.com'],
  );
  assert.match(message.subject, /\b21\b/);
  assert.match(message.text, /\b21\b/);
  assert.ok(message.from.address, 'it has a sender');
});

test('a mail server that does not answer makes the email fail in about 5 seconds', async () => {
  // It accepts the connection and says nothing: SMTP starts with the server's greeting, which never comes.
  const connections = new Set<Socket>();
  const mute = createServer((connection) => connections.add(connection)).listen(0, '127.0.0.1');
  await once(mute, 'listening');
  try {
    const { port } = mute.address() as AddressInfo;
    const transport = makeTransport(`smtp://127.0.0.1:${port}`);
    const order = (await findOrder(21))!;
    const before = Date.now();
    // An error: the queue will retry it. With Nodemailer's waits it would be 30 seconds.
    // ETIMEDOUT: the greeting that doesn't come or the silent connection, whichever fires first (both at 5 s).
    await assert.rejects(sendConfirmation(order, transport), { code: 'ETIMEDOUT' });
    const taken = Date.now() - before;
    assert.ok(taken >= 4500 && taken < 7000, `it took ${taken} ms`);
  } finally {
    for (const connection of connections) connection.destroy();
    mute.close();
  }
});
