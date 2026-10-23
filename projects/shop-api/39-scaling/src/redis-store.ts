// The store for the attempt limits in Redis (Phase 7, lesson 7). With two copies of the API
// (docker compose up --scale api=2), each with its own memory, each copy would keep its own count:
// ten attempts in one and ten in the other. Redis is a separate server that keeps data in memory,
// very fast, and both copies ask the same one: a single count. It meets the same interface as the
// memory store (LimitStore, rate-limits.ts), so the limiter doesn't change.
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import type { LimitStore } from './rate-limits.ts';

// #region connect
/** A Redis client for that address: redis://server:port/database */
export function connectRedis(url: string) {
  const client = createClient({ url });
  // If Redis goes down, the client warns with an 'error' and reconnects on its own. With nobody
  // listening to it, Node would stop the server (like the PostgreSQL pool, in db.ts).
  client.on('error', (error: Error) => console.error('Redis:', error.message));
  // While it connects, the commands that arrive wait in a queue.
  client.connect().catch(() => {});
  return client;
}
// #endregion connect

export type RedisClient = ReturnType<typeof connectRedis>;

// #region redis-store
// None of the shop's windows is longer than an hour: a key nobody touches in a day is not needed.
const ONE_DAY = 24 * 60 * 60 * 1000;

// Each key's attempts, in a Redis sorted set: each attempt is a member, and its score, the instant
// in ms. Redis keeps them ordered by score, so "delete the ones before since" or "give all of them,
// from oldest to newest" is one command.
// prefix: in front of each key, so they don't mix with other data in the same Redis.
export function createRedisStore(client: RedisClient, prefix = 'limits:'): LimitStore {
  return {
    async attempts(key, since) {
      // MULTI: both commands, together and in order, without another one sneaking in between.
      const [, attempts] = await client
        .multi()
        .zRemRangeByScore(prefix + key, '-inf', since) // the ones that left the window, out
        .zRangeWithScores(prefix + key, 0, -1) // the ones that are left
        .execTyped();
      return attempts.map((attempt) => attempt.score);
    },
    async record(key, instant) {
      await client
        .multi()
        // The member, unique: two attempts in the same millisecond are two attempts.
        .zAdd(prefix + key, { score: instant, value: `${instant}-${randomUUID()}` })
        .pExpire(prefix + key, ONE_DAY)
        .execTyped();
    },
  };
}
// Each function is atomic, but check and record (rate-limits.ts) are two trips to Redis: between
// one and the other, the other copy of the API can record an attempt. In the worst case one too
// many slips in, right at the limit; to slow down brute force, that's enough. If it had to be
// exact, a Lua script would do both things inside Redis, at once.
// #endregion redis-store
