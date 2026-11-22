// Practice traffic (Phase 10, lessons 6 and 7): a customer who never stops buying, so the charts and
// the alerts have something to look at. With the shop running, in another terminal:
//   npm run traffic                      until you press Ctrl + C
// In each round, Carmen (a practice account, db/accounts.sql) signs in, buys a mug, pays it with the
// fake payment gateway (scripts/payment-gateway.ts, as you would by hand with npm run gateway) and
// cancels the order, to give the mug back to the stock: otherwise, in a few minutes the shop would
// run out of mugs and everything would be 409. Each payment leaves a confirmation email in Mailpit.
// She always buys with the same session, the first one she opens. She signs in on every round only so
// there are sign-ins among the traffic (lesson 7 needs them: they are what fails with Redis frozen),
// and each new session is closed at once: without that, it would leave about 3000 rows an hour in
// the sessions table.
// It writes one line per round, with the time and the code of each response, and at the end, how many.
// It reads SHOP_URL (by default http://localhost:3000) and WEBHOOK_SECRET from .env, like the gateway.
import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const shop = process.env.SHOP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
// With the session cookie, the shop requires Origin (CSRF, Phase 6): a site from ALLOWED_ORIGINS.
const ORIGIN = 'http://localhost:3000';
const json = { 'Content-Type': 'application/json' };
const CARMEN = { email: 'carmen@example.com', password: 'carmen-practice-2026' };
const MUG = 2; // db/seed.sql: the one with the most stock

let keepGoing = true;
process.once('SIGINT', () => {
  keepGoing = false;
});

// The cookie of the session she buys with. If signing in fails, she goes on buying with it.
let cookie: string | undefined;
const responses = new Map<string, number>();
const count = (code: string) => responses.set(code, (responses.get(code) ?? 0) + 1);

// A response, or undefined if it couldn't even be asked (the shop stopped, for example).
async function request(path: string, init: RequestInit): Promise<Response | undefined> {
  try {
    return await fetch(`${shop}${path}`, init);
  } catch {
    return undefined;
  }
}

// #region round
async function oneRound(): Promise<string[]> {
  const line: string[] = [];
  const note = (step: string, code: number | string) => {
    line.push(`${step} ${code}`);
    count(String(code));
  };

  const session = await request('/v2/session', {
    method: 'POST',
    headers: json,
    body: JSON.stringify(CARMEN),
  });
  note('session', session?.status ?? '---');
  const fresh = session?.ok ? session.headers.getSetCookie()[0]?.split(';')[0] : undefined;
  if (fresh && !cookie) {
    // The first one: she buys with this one, round after round.
    cookie = fresh;
  } else if (fresh) {
    // The others were only to try: they are closed.
    const signOut = await request('/v2/session', {
      method: 'DELETE',
      headers: { Cookie: fresh, Origin: ORIGIN },
    });
    note('sign-out', signOut?.status ?? '---');
  }
  if (!cookie) return line;
  const withSession = { ...json, Cookie: cookie, Origin: ORIGIN };

  const order = await request('/v2/orders', {
    method: 'POST',
    headers: withSession,
    body: JSON.stringify({ productId: MUG, quantity: 1 }),
  });
  note('order', order?.status ?? '---');
  // The session has expired: the next one that is opened becomes the one she buys with.
  if (order?.status === 401) cookie = undefined;
  if (order?.status !== 201) return line;
  const { id } = (await order.json()) as { id: number };

  // The gateway, the same script you use by hand: it signs the notice with WEBHOOK_SECRET and sends it.
  try {
    const { stdout } = await execute(process.execPath, ['scripts/payment-gateway.ts', String(id)], {
      env: { ...process.env, SHOP_URL: shop },
    });
    note('payment', stdout.match(/← (\d{3})/)?.[1] ?? '---');
  } catch {
    note('payment', '---');
  }

  const cancel = await request(`/v2/orders/${id}/cancellation`, {
    method: 'POST',
    headers: withSession,
  });
  note('cancel', cancel?.status ?? '---');
  return line;
}
// #endregion round

console.log(`Traffic against ${shop}. Ctrl + C to stop.`);
while (keepGoing) {
  const time = new Date().toLocaleTimeString('en-GB');
  console.log(`${time}  ${(await oneRound()).join('  ')}`);
  if (keepGoing) await sleep(1000);
}
const summary = [...responses].map(([code, howMany]) => `${code}: ${howMany}`).join(', ');
console.log(`\nResponses: ${summary}`);
