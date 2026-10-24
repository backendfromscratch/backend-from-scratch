// Rate limiting (lesson 8): how many times something can be tried in a while. Without a limit,
// whoever wants to get into Ana's account tries passwords nonstop (brute force); with 10 attempts
// every 15 minutes, trying the 1000 most used takes them a whole day, and it shows.
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { config, normalizeIp } from './config.ts';
import { log } from './log.ts';
import { problem, problemType } from './problems.ts';
import { connectRedis, createRedisStore } from './redis-store.ts';

// #region store
// Where the attempts are kept. Here, in the server's memory: if it restarts, they're forgotten,
// and with two servers each one would keep its own count. With Redis (redis-store.ts, Phase 7),
// the count is one, shared by all: it's another store with these two functions, without touching
// the rest.
export interface LimitStore {
  /** The instants (in ms) of that key's attempts after "since", from oldest to newest. */
  attempts(key: string, since: number): Promise<number[]>;
  /** Records an attempt of that key at that instant. */
  record(key: string, instant: number): Promise<void>;
}

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
  // What to do if the store can't be asked (Phase 10, lesson 6): close, let nobody through; open,
  // let everybody through, as if there were no limit. Further down, which one each limit uses.
  onFailure: 'open' | 'closed';
}

export interface State {
  allowed: boolean;
  left: number; // how many attempts are left right now
  retryIn: number; // if it isn't allowed, in how many seconds a slot frees up
  resetIn: number; // in how many seconds the oldest attempt leaves the window
}

// A limit that closes, with no store that answers: whoever uses it replies 503 (storeUnavailable,
// further down).
export class LimitsUnavailable extends Error {
  constructor(name: string, reason: string) {
    super(`the ${name} limit can't ask its store: ${reason}`);
    this.name = 'LimitsUnavailable';
  }
}

// clock: where the time comes from. The tests give it their own, to make 15 minutes pass at once.
// wait: how many ms the store is waited for, at most, in each question.
export function createLimiter(
  limit: Limit,
  store: LimitStore = createMemoryStore(),
  clock: () => number = Date.now,
  wait = 200,
) {
  const window = limit.window * 1000;
  const key = (of: string) => `${limit.name}:${of}`;

  // #region within-time
  // Each question to the store, with a time limit (Phase 10, lesson 6), like the cache's
  // (withinTime, in cache.ts). Up to step 45, a frozen Redis (docker compose pause redis) left the
  // request waiting forever: the connection stays open, the command goes out and the answer never
  // arrives. Redis answers in under a millisecond; 200 ms is already something wrong. If it doesn't
  // answer in time, or gives an error, the limit does what onFailure says. The command keeps waiting
  // inside the Redis client, but the request no longer waits for it (that is why, ask, further down).
  async function withinTime<T>(question: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${wait} ms`)), wait);
    });
    const answer = question();
    // If it arrives late, nobody cares about its error any more: without this, Node would take it as unhandled.
    answer.catch(() => {});
    try {
      return await Promise.race([answer, late]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Each command that doesn't answer in time stays waiting in the Redis client until Redis comes
  // back. With one per request, a thousand sign-ins during an outage would be a thousand pending
  // commands in the API's memory. So, like the cache (cache.ts), as soon as one fails the store is
  // taken as down and isn't even asked: it fails at once. At most once a second, one request acts as
  // a probe and really asks it; if it answers, the store is back.
  let down = false;
  let lastProbe = -Infinity;
  async function ask<T>(question: () => Promise<T>): Promise<T> {
    if (down) {
      if (clock() - lastProbe < 1000) throw new Error('no answer: it will be tried again');
      lastProbe = clock();
    }
    try {
      const answer = await withinTime(question);
      down = false;
      return answer;
    } catch (error) {
      down = true;
      lastProbe = clock();
      throw error;
    }
  }

  // To the log, at most once a second for each limit: with Redis frozen, every request would go
  // through here, and a thousand identical lines hide the rest.
  let lastWarning = -Infinity;
  function failure(error: unknown): void {
    const reason = (error as Error).message;
    if (clock() - lastWarning >= 1000) {
      lastWarning = clock();
      log.warn(
        { limit: limit.name, onFailure: limit.onFailure, reason },
        limit.onFailure === 'closed'
          ? "the limits can't ask their store: nobody is let through"
          : "the limits can't ask their store: everybody is let through",
      );
    }
    if (limit.onFailure === 'closed') throw new LimitsUnavailable(limit.name, reason);
  }
  // #endregion within-time

  return {
    limit,
    // Looks at how that key stands, without recording anything.
    async check(of: string): Promise<State> {
      const now = clock();
      let attempts: number[];
      try {
        attempts = await ask(() => store.attempts(key(of), now - window));
      } catch (error) {
        failure(error);
        // Open: as if there were no attempts.
        return { allowed: true, left: limit.max, retryIn: 0, resetIn: 0 };
      }
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
    // Records an attempt now. Open, if it can't be recorded, it isn't.
    async record(of: string): Promise<void> {
      try {
        await ask(() => store.record(key(of), clock()));
      } catch (error) {
        failure(error);
      }
    },
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
// #endregion limiter

// #region chosen-store
// With REDIS_URL (in Docker Compose), the attempts go to Redis, shared by all the copies of the
// API; without it, to this server's memory, as until now. It is exported for the tests, which
// change its functions for others that don't answer.
const redisClient = config.REDIS_URL ? connectRedis(config.REDIS_URL) : undefined;
export const store = redisClient ? createRedisStore(redisClient) : createMemoryStore();

// For /health/ready (health.ts): a PING to Redis over the same connection. It is the queue's Redis.
export const pingRedis = () => redisClient!.ping();

// When the API shuts down (Phase 9, lesson 4): closes the connection to Redis, if there is one,
// without waiting for what is on its way. When it's called, no request is left, so there is nothing.
export async function closeLimits(): Promise<void> {
  redisClient?.destroy();
}
// #endregion chosen-store

// #region shop-limits
// The shop's limits. When signing in only the failures count, and from two sides: by email (it
// protects each account, even if the attack comes from a thousand IPs) and by IP (it slows down
// whoever tries many accounts at once). The trap of the limit by email: anyone can use up Ana's 10
// attempts and leave her out for 15 minutes. That's why it's a while, not a lock forever. And the
// IP's is higher, because behind one IP there can be a whole office, or a university.
// If Redis fails (Phase 10, lesson 6), the two sign-in ones close: letting passwords through with no
// limit is exactly the attack they exist to stop, and nobody can sign in until Redis is back (503).
// The account-creation one opens: a few sign-ups with no limit while Redis is down cost less than
// not letting any new customer in. It is a decision, not a rule: another shop might decide the
// opposite.
export const limits = {
  signInByEmail: createLimiter(
    { name: 'session-email', max: 10, window: 15 * 60, onFailure: 'closed' },
    store,
  ),
  signInByIp: createLimiter(
    { name: 'session-ip', max: 30, window: 15 * 60, onFailure: 'closed' },
    store,
  ),
  // Creating accounts: every attempt counts, whether it goes well or badly.
  accountsByIp: createLimiter(
    { name: 'accounts-ip', max: 5, window: 60 * 60, onFailure: 'open' },
    store,
  ),
};
// #endregion shop-limits

// #region ip
// The IP of whoever makes the request. By default, the one on the other side of the connection.
// Behind a proxy (Nginx, Phase 8) that would always be the proxy's (with Docker, the network's
// gateway, like 172.18.0.1), and the real one arrives in X-Forwarded-For. But anyone can write that
// header, so it's only read if the connection comes from an IP in TRUSTED_PROXY; from any other, it
// is ignored. And the last entry of the list is taken, the one our proxy added: the earlier ones
// could have been written by the client. With app.request (in the tests) there's no connection, and
// the one the test passes is used, or "unknown".
export function ipOfWithProxies(c: Context, proxies: string[]): string {
  let connection: string;
  try {
    connection = getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
  if (!proxies.map(normalizeIp).includes(normalizeIp(connection))) return connection;
  const last = c.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim();
  return last ? last : connection;
}

export function ipOf(c: Context): string {
  return ipOfWithProxies(c, config.TRUSTED_PROXY);
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

// 503 Service Unavailable: a closed limit that can't ask its store (LimitsUnavailable). Retry-After:
// 5, a few seconds, not the window's 15 minutes: it isn't that you tried too much, it's that the
// shop can't count it right now.
export function storeUnavailable(c: Context) {
  return problem(
    c,
    {
      type: problemType('attempts-unchecked'),
      title: "The attempts can't be checked",
      status: 503,
      detail: "Right now you can't sign in. Try again in a few seconds",
    },
    { 'Retry-After': '5' },
  );
}
// #endregion headers
