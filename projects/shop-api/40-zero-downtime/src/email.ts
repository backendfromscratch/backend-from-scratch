// The confirmation email (Phase 9, lesson 1): when an order becomes paid, the shop writes to whoever
// placed it. The worker sends it, as a job of the queue (queue.ts): talking to a mail server takes
// time, and it can fail, and the payment gateway doesn't have to wait for it.
// Nodemailer speaks SMTP, the protocol emails are sent with, with the server in SMTP_URL: on your
// computer, Mailpit, which keeps them in an inbox and sends them to nobody
// (http://localhost:8025).
import { eq } from 'drizzle-orm';
import { createTransport, type Transporter } from 'nodemailer';
import { config } from './config.ts';
import type { Order } from './data.ts';
import { db } from './db.ts';
import { log } from './log.ts';
import { users } from './schema.ts';

// A mail server's transport, with short waits. Nodemailer's, if nothing else is said, are long (up
// to 2 minutes to connect and 10 without news from the server): a stuck server would keep the
// worker waiting, and when it shuts down (docker stop waits 10 seconds) it would be killed with the
// email half sent, and the queue would repeat it. With 5 seconds at most in each step (connecting,
// the server's greeting and each answer), it fails early, and the queue retries it.
const MAX_WAIT = 5000; // ms
export const makeTransport = (url: string): Transporter =>
  createTransport({
    url,
    connectionTimeout: MAX_WAIT,
    greetingTimeout: MAX_WAIT,
    socketTimeout: MAX_WAIT,
  });

// A single transport for all the emails, created the first time it's needed.
let configured: Transporter | undefined;
const configuredTransport = () =>
  config.SMTP_URL ? (configured ??= makeTransport(config.SMTP_URL)) : undefined;

// #region email
// Returns what happened: sent, no mail server (no-smtp) or nobody to write to (no-customer: the
// orders from before the accounts, Phase 6, belong to nobody). If the mail server fails, it throws
// an error, and the queue retries. transport: in the tests, one that sends nothing.
export async function sendConfirmation(
  order: Order,
  transport: Transporter | undefined = configuredTransport(),
): Promise<'sent' | 'no-smtp' | 'no-customer'> {
  if (order.customerId === null) return 'no-customer';
  if (!transport) {
    // On a server without SMTP_URL, the shop works all the same: it only says which email didn't go out.
    log.info({ orderId: order.id }, 'no SMTP_URL: the confirmation email is not sent');
    return 'no-smtp';
  }
  const [customer] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, order.customerId));
  if (!customer) return 'no-customer'; // the account has been deleted
  await transport.sendMail({
    from: config.SMTP_FROM,
    to: customer.email,
    subject: `Your order ${order.id} is paid`,
    text:
      `Hello:\n\nWe have received the payment for your order ${order.id}. ` +
      "We'll let you know when it leaves for your home.\n\nThanks for shopping with us.\n",
  });
  return 'sent';
}
// #endregion email
