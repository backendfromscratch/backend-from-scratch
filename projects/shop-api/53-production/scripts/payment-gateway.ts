// A fake payment gateway: it notifies the shop that an order has been paid, with a signed
// webhook. With the server running, in another terminal:
//   npm run gateway -- 3            order 3, paid
//   npm run gateway -- 3 --tamper   someone changes the body on the way
//   npm run gateway -- 3 --repeat   the same notification, twice
// It reads WEBHOOK_SECRET from .env, like the server: both have to know the same secret.
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { sign } from '../src/signature.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { tamper: { type: 'boolean' }, repeat: { type: 'boolean' } },
});
const orderId = Number(positionals[0]);
const secret = process.env.WEBHOOK_SECRET;
if (!Number.isInteger(orderId) || secret === undefined) {
  console.error('Usage: npm run gateway -- <orderId> [--tamper] [--repeat], with WEBHOOK_SECRET');
  process.exit(1);
}
const shop = process.env.SHOP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

// #region send
// The event carries its own id: if the shop receives it twice, it knows it's the same one.
const event = { id: `evt_${randomUUID()}`, type: 'payment.completed', orderId };
const body = JSON.stringify(event);
const signature = sign(body, secret);

async function send(sentBody: string) {
  console.log(`→ POST /v2/webhooks/payments ${sentBody}`);
  const res = await fetch(`${shop}/v2/webhooks/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body: sentBody,
  });
  console.log(`← ${res.status} ${await res.text()}`);
}

// --tamper: someone changes the order on the way, but the signature is the original body's.
if (values.tamper) {
  await send(body.replace(`"orderId":${orderId}`, `"orderId":${orderId + 1}`));
} else {
  await send(body);
}
// --repeat: the same event again, like when the gateway gets no response and retries.
if (values.repeat) await send(body);
// #endregion send
