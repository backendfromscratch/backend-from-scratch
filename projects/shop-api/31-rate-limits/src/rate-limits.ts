// Rate limiting (lesson 8): how many times something can be tried in a while. Without a limit,
// whoever wants to get into Ana's account tries passwords nonstop (brute force); with 10 attempts
// every 15 minutes, trying the 1000 most used takes them a whole day, and it shows.
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { problem, problemType } from './problems.ts';

// #region store
// #region store-interface
// Where the attempts are kept. Here, in the server's memory: if it restarts, they're forgotten,
// and with two servers each one would keep its own count. In Phase 7 the store will be Redis,
// shared by all: writing another store with these two functions is enough, without touching the
// rest.
export interface LimitStore {
  /** The instants (in ms) of that key's attempts after "since", from oldest to newest. */
  attempts(key: string, since: number): Promise<number[]>;
  /** Records an attempt of that key at that instant. */
  record(key: string, instant: number): Promise<void>;
}
// #endregion store-interface

export function createMemoryStore(): LimitStore {
  const byKey = new Map<string, number[]>();
  return {
    async attempts(key, since) {
      // The ones that have already left the window are forgotten; a key without attempts, too.
      const recent = (byKey.get(key) ?? []).filter((instant) => instant > since);
      if (recent.length === 0) byKey.delete(key);
      else byKey.set(key, recent);
      return recent;
    },
    async record(key, instant) {
      byKey.set(key, [...(byKey.get(key) ?? []), instant]);
    },
  };
}
// #endregion store

// #region limiter
// The algorithm: sliding window. To decide, the attempts of the last 15 minutes are counted,
// counted from right now (not from 10:00, 10:15…). It's the easiest to explain and the most exact:
// with a fixed window, whoever makes 10 attempts at 10:14 and another 10 at 10:15 makes 20 in two
// minutes. In exchange, it keeps each attempt; with a maximum of 10, it weighs nothing.
export interface Limit {
  name: string; // for the headers: "session-email"
  max: number; // how many attempts fit in the window
  window: number; // in seconds
}

export interface State {
  allowed: boolean;
  left: number; // how many attempts are left right now
  retryIn: number; // if it isn't allowed, in how many seconds a slot frees up
  resetIn: number; // in how many seconds the oldest attempt leaves the window
}

// clock: where the time comes from. The tests give it their own, to make 15 minutes pass at once.
export function createLimiter(
  limit: Limit,
  store: LimitStore = createMemoryStore(),
  clock: () => number = Date.now,
) {
  const window = limit.window * 1000;
  const key = (of: string) => `${limit.name}:${of}`;
  return {
    limit,
    // #region check
    // Looks at how that key stands, without recording anything.
    async check(of: string): Promise<State> {
      const now = clock();
      const attempts = await store.attempts(key(of), now - window);
      const secondsUntil = (instant: number) => Math.ceil((instant + window - now) / 1000);
      const allowed = attempts.length < limit.max;
      return {
        allowed,
        left: Math.max(0, limit.max - attempts.length),
        // For another one to fit, the one that leaves exactly "max" attempts inside has to leave.
        retryIn: allowed ? 0 : secondsUntil(attempts[attempts.length - limit.max]!),
        resetIn: attempts.length === 0 ? 0 : secondsUntil(attempts[0]!),
      };
    },
    // #endregion check
    // Records an attempt now.
    async record(of: string): Promise<void> {
      await store.record(key(of), clock());
    },
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
// #endregion limiter

// #region shop-limits
// The shop's limits. When signing in only the failures count, and from two sides: by email (it
// protects each account, even if the attack comes from a thousand IPs) and by IP (it slows down
// whoever tries many accounts at once). The trap of the limit by email: anyone can use up Ana's 10
// attempts and leave her out for 15 minutes. That's why it's a while, not a lock forever. And the
// IP's is higher, because behind one IP there can be a whole office, or a university.
export const limits = {
  signInByEmail: createLimiter({ name: 'session-email', max: 10, window: 15 * 60 }),
  signInByIp: createLimiter({ name: 'session-ip', max: 30, window: 15 * 60 }),
  // Creating accounts: every attempt counts, whether it goes well or badly.
  accountsByIp: createLimiter({ name: 'accounts-ip', max: 5, window: 60 * 60 }),
};
// #endregion shop-limits

// #region ip
// The IP of whoever makes the request: the one on the other side of the connection. Behind a proxy
// (Nginx, Phase 8) it would be the proxy's, and the real one would arrive in X-Forwarded-For; but
// anyone can write that header, so it's only read if your own proxy puts it. With app.request (in
// the tests) there's no connection, and the one the test passes is used, or "unknown".
export function ipOf(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
// #endregion ip

// #region headers
// The RateLimit-Policy (the rules) and RateLimit (how you're doing now) headers come from an IETF
// draft (draft-ietf-httpapi-ratelimit-headers), not a standard yet: q is the maximum, w the window
// in seconds, r the ones left and t the seconds until one frees up.
export function setHeaders(c: Context, checked: [Limiter, State][]) {
  const policies = checked.map(([{ limit }]) => `"${limit.name}";q=${limit.max};w=${limit.window}`);
  const states = checked.map(
    ([{ limit }, state]) => `"${limit.name}";r=${state.left};t=${state.resetIn}`,
  );
  c.header('RateLimit-Policy', policies.join(', '));
  c.header('RateLimit', states.join(', '));
}

// 429 Too Many Requests, with Retry-After (RFC 9110): how many seconds to wait. This one is
// standard.
export function tooManyAttempts(c: Context, checked: [Limiter, State][]) {
  setHeaders(c, checked);
  const wait = Math.max(...checked.map(([, state]) => state.retryIn));
  return problem(
    c,
    {
      type: problemType('too-many-attempts'),
      title: 'Too many attempts',
      status: 429,
      detail: `Wait ${wait} seconds and try again`,
    },
    { 'Retry-After': String(wait) },
  );
}
// #endregion headers
