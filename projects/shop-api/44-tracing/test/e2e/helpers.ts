// What the end-to-end tests share (Phase 10, lesson 2): where the shop and its mailbox are, and a
// wait with a time limit. Unlike the other tests, these import nothing from src/: they talk to
// the shop over HTTP, like any client, and the shop has to be running
// (docker compose up -d --build --wait).
import { setTimeout as sleep } from 'node:timers/promises';

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
// Mailpit's API, the mailbox where the practice emails arrive.
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
// With the session cookie, the shop demands Origin (Phase 6, lesson 7). It is the website the shop
// accepts requests from (ALLOWED_ORIGINS), not the address we call.
export const ORIGIN = 'http://localhost:3000';

/** Tries `attempt` every second until it returns something, or throws an error after `max` ms. */
export async function waitFor<T>(
  description: string,
  attempt: () => Promise<T | undefined>,
  max = 30_000,
): Promise<T> {
  const deadline = Date.now() + max;
  while (Date.now() < deadline) {
    const result = await attempt();
    if (result !== undefined) return result;
    await sleep(1000);
  }
  throw new Error(`${max / 1000} seconds passed and it never arrived: ${description}`);
}
