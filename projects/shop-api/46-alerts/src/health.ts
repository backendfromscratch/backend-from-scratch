// The checks of /health/ready (Phase 10, lesson 6): who the shop asks to know whether it can serve,
// and how. The routes are in app.ts.
import { pool } from './db.ts';
import { cache } from './cache.ts';
import { config } from './config.ts';
import { pingRedis } from './rate-limits.ts';

export type Result = 'ok' | 'failing' | 'not-configured';

// One PING at a time. With Redis frozen, each PING stays waiting in its connection's command queue
// until Redis comes back: a new one on every call to /health/ready would pile up, one for each time
// the probe asks. So, while one is still unanswered, the next call waits on that same one (with
// check's limit). Like the gauges in metrics.ts.
function oneAtATime(ask: () => Promise<unknown>): () => Promise<unknown> {
  let inFlight: Promise<unknown> | undefined;
  return () =>
    (inFlight ??= ask().finally(() => {
      inFlight = undefined;
    }));
}
const pingQueue = oneAtATime(() => pingRedis());
const pingCache = oneAtATime(() => cache.ping());

// #region checks
// One per dependency. Each one returns a promise that is fulfilled if it answers, or
// 'not-configured' if the shop works without it (without REDIS_URL, the limits go in memory and the
// jobs are done in the API; without CACHE_URL, there is no cache). In an object, so the tests can
// change one.
//   db: SELECT 1, through the same pool as the requests.
//   queue: a PING to the queue's Redis (REDIS_URL), through the limits' connection, one at a time.
//   cache: a PING to the cache's Redis (CACHE_URL), one at a time.
export const checks = {
  db: (): Promise<unknown> | 'not-configured' => pool.query('SELECT 1'),
  queue: (): Promise<unknown> | 'not-configured' =>
    config.REDIS_URL ? pingQueue() : 'not-configured',
  cache: (): Promise<unknown> | 'not-configured' =>
    config.CACHE_URL ? pingCache() : 'not-configured',
};
// #endregion checks

// #region check
// One check, with a maximum time: if it doesn't answer in waitMs, it fails. A frozen dependency
// (docker compose pause) never answers, and whoever asks about health has to receive an answer, not
// wait with it. The question stays running, but it is no longer waited for.
export async function check(
  run: () => Promise<unknown> | 'not-configured',
  waitMs = 500,
): Promise<Result> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const answer = run();
    if (answer === 'not-configured') return 'not-configured';
    answer.catch(() => {});
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('no answer in time')), waitMs);
    });
    await Promise.race([answer, late]);
    return 'ok';
  } catch {
    return 'failing';
  } finally {
    clearTimeout(timer);
  }
}
// #endregion check

// #region ready
// Can this copy serve? All three at once (not one after another: three waits of 500 ms would be
// 1.5 s). It fails if PostgreSQL or the queue's Redis fails: without the database there is no shop,
// and without that Redis nobody can sign in (the limits close) and no job goes out. The cache is
// reported, but doesn't count: without it, everything is read from PostgreSQL, slower.
export async function checkAll() {
  const [db, queue, cache] = await Promise.all([
    check(checks.db),
    check(checks.queue),
    check(checks.cache),
  ]);
  const ready = db !== 'failing' && queue !== 'failing';
  return { ready, checks: { db, queue, cache } };
}
// #endregion ready
