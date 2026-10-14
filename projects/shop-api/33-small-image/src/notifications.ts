// The notifications to the delivery company (lesson 7): when an order becomes paid, the shop sends
// a signed POST to the URL the company gave. It's a webhook, like the payment gateway's in Phase 4,
// but the other way round: now the shop is the one that notifies.
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Order } from './data.ts';
import { db } from './db.ts';
import { log } from './log.ts';
import { postJson, type Options } from './safe-url.ts';
import { notifications } from './schema.ts';
import { sign } from './signature.ts';

// #region save-notification
// Saves a key's URL (already checked), with a new secret for signing, and returns it: the company
// needs it to check the signatures. If it already had one, it changes it (ON CONFLICT … DO UPDATE).
export async function saveNotification(keyId: number, url: string): Promise<string> {
  const secret = randomBytes(32).toString('base64url');
  await db
    .insert(notifications)
    .values({ keyId, url, secret })
    .onConflictDoUpdate({
      target: notifications.keyId,
      set: { url, secret, changedAt: sql`now()` },
    });
  return secret;
}
// #endregion save-notification

// #region notify
// A notice to each saved URL, signed with its secret. The URL is checked again when sending (in
// postJson): what pointed to the internet when it was saved may point somewhere else today.
export async function notifyPayment(order: Order, options?: Options): Promise<void> {
  for (const { url, secret } of await db.select().from(notifications)) {
    const body = JSON.stringify({ type: 'order.paid', order });
    const result = await postJson(url, body, { 'X-Signature': sign(body, secret) }, options);
    if ('error' in result) log.warn({ url, reason: result.error }, 'notification not delivered');
  }
}
// #endregion notify
