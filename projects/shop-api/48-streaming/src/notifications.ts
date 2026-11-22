// The notifications to the delivery company (lesson 7): when an order becomes paid, the shop sends
// a signed POST to the URL the company gave. It's a webhook, like the payment gateway's in Phase 4,
// but the other way round: now the shop is the one that notifies. Since Phase 9, each notification is
// a job of the queue (queue.ts): the worker sends it, and if it fails, it tries again.
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Order } from './data.ts';
import { db, type Transaction } from './db.ts';
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

/**
 * The saved notifications, by id (the company's key id): one for each URL. tx: inside the payment's
 * transaction (v2.ts), through its same connection. With another one from the pool, ten payments at
 * once would have all ten connections in their transactions, waiting forever for an eleventh.
 */
export async function savedNotifications(tx: Transaction | typeof db = db): Promise<number[]> {
  const rows = await tx.select({ id: notifications.keyId }).from(notifications);
  return rows.map((row) => row.id);
}

// #region notify
// One notification, to a saved URL, signed with its secret. The URL and the secret are read now, not
// when it was paid: if the company has changed them while the job waited, what counts is what's
// there now. The URL is checked again when sending (in postJson): what pointed to the internet when
// it was saved may point somewhere else today.
// X-Event-Id: the same on every retry. If the notification arrives twice (the company got it, but
// its answer was lost and the shop sends it again), the company sees the same id and doesn't process
// it again, like the shop does with the gateway's notifications (Phase 4).
// If it doesn't arrive, it throws an error: that way the queue knows it has failed and retries it later.
export async function notifyOne(
  notificationId: number,
  order: Order,
  eventId: string,
  options?: Options,
): Promise<void> {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.keyId, notificationId));
  if (!notification) {
    // The company has removed its URL: there is nobody to notify, and retrying wouldn't change that.
    log.info({ notificationId }, 'notification no longer exists, not sent');
    return;
  }
  const body = JSON.stringify({ type: 'order.paid', order });
  const result = await postJson(
    notification.url,
    body,
    { 'X-Signature': sign(body, notification.secret), 'X-Event-Id': eventId },
    options,
  );
  if ('error' in result) throw new Error(`notification not delivered: ${result.error}`);
  // A response that isn't 2xx doesn't count either: the company got it, but didn't save it.
  if (result.status < 200 || result.status > 299) {
    throw new Error(`notification not delivered: the company answers ${result.status}`);
  }
}
// #endregion notify
