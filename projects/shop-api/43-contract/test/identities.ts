// Who makes each request in the tests: the practice accounts from db/seed.sql and a delivery key.
// The sessions are created directly, without going through the password: that way an argon2 isn't
// computed in each test. Signing in for real is tested in sessions.test.ts.
import { createKey } from '../src/api-keys.ts';
import { createSession } from '../src/sessions.ts';

export const ANA = 1; // admin
export const LUIS = 2; // admin
export const CARMEN = 3; // customer: the odd-numbered orders
export const PABLO = 4; // customer: the even-numbered ones

/**
 * The headers of a new session for that account, as the browser would send them from the shop
 * itself: the cookie and Origin (from lesson 7, a request with the cookie and without Origin
 * doesn't pass).
 */
export async function asUser(id: number): Promise<Record<string, string>> {
  return { Cookie: `session=${await createSession(id)}`, Origin: 'http://localhost:3000' };
}

/** The headers of a new API key, the delivery company's. */
export async function asDelivery(): Promise<Record<string, string>> {
  const { key } = await createKey('Fast Delivery');
  return { Authorization: `Bearer ${key}` };
}
