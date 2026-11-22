// The cache (Phase 9, lesson 2): what is asked for a lot and changes little (the catalogue), kept
// for a while in Redis, so PostgreSQL isn't asked the same thing on every request. It is another
// Redis, not the queue's (CACHE_URL, not REDIS_URL): the queue can't lose anything, and the cache
// can lose everything, so each one is set up the opposite way (compose.yaml).
// Without CACHE_URL (without Docker, as up to Phase 8), there is no cache: everything is read from
// the database.
import { createClient } from 'redis';
import { config } from './config.ts';
import { log } from './log.ts';

// #region ttl
// How long a key lasts in the cache: the seconds asked for, plus up to 10 % at random. If all of
// them lasted the same, the ones stored at the same time (at startup, or after deleting the lists)
// would expire at the same time, and at that instant every request would go to PostgreSQL together:
// a stampede. With 60 seconds, each one expires at some moment between 60 and 66, spread out.
// random: Math.random, which gives a number between 0 and 1; in the tests, a fixed one.
export function duration(seconds: number, random: () => number = Math.random): number {
  return Math.round(seconds * 1000 * (1 + 0.1 * random()));
}
// #endregion ttl

export interface Cache {
  fromCache<T>(key: string, seconds: number, read: () => Promise<T>): Promise<T>;
  forget(...keys: string[]): Promise<void>;
  // Opens the connection, if it isn't open, and resolves the first time the cache is ready to be
  // used: connected, and with the old data already deleted (on-return). Without a cache, right away.
  // Until then, everything is read from the database. For the tests, which wait for it before looking.
  connect(): Promise<void>;
  // A PING to Redis, for /health/ready (health.ts, Phase 10, lesson 6). Without a cache, it isn't called.
  ping(): Promise<unknown>;
  close(): Promise<void>;
}

/** A cache in the Redis at that address (redis://server:6379), or none, without an address. */
export function createCache(url: string | undefined): Cache {
  if (!url) {
    return {
      fromCache: (_key, _seconds, read) => read(),
      forget: async () => {},
      connect: async () => {},
      ping: async () => {},
      close: async () => {},
    };
  }

  // #region client
  // Its own client, not connectRedis's (redis-store.ts): a cache isn't waited for. The normal
  // client, with Redis down, keeps each command in a queue until it comes back, and the request
  // would wait with it.
  //   disableOfflineQueue: without a connection, the command fails at once, without waiting in a
  //     queue.
  //   connectTimeout: one second to connect; then another attempt, and so on until it comes back.
  // That covers a cache that is down (the connection is cut). It doesn't cover one that is stuck: a
  // stopped Redis, or a network that loses the replies. The connection stays open, the client sends
  // the command and waits for the reply with no limit: node-redis has a timeout per command, but it
  // only counts while the command waits to go out, not after it is sent. That is why each command
  // goes with a clock of its own (withinTime, further down).
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000 },
  });
  // #endregion client

  // #region down
  // If the cache fails (the connection is cut, or a command doesn't answer in time), it is taken as
  // down: to the log once, and while it stays down, it isn't even asked. Everything goes to
  // PostgreSQL, without waiting, and without piling up commands that won't be answered. Every
  // second, at most, a PING is sent: if it answers, it comes back (on-return, further down). down
  // starts as true: until it connects, it isn't asked either.
  let down = true;
  let warned = false;
  let lastProbe = 0;
  const markDown = (reason: string) => {
    down = true;
    if (warned) return;
    warned = true;
    log.warn({ reason }, 'the cache is not answering: reading from the database');
  };
  // Without anyone listening to 'error', Node would stop the API.
  client.on('error', (error: Error) => markDown(error.message));
  client.on('ready', () => void comeBack());
  let markReady: () => void;
  const connected = new Promise<void>((resolve) => (markReady = resolve));

  // The connection is opened the first time the cache is used, not when this file is loaded, like
  // the queue's (queue.ts). A script that loads data.ts without using the cache (create-admin)
  // opens none, and ends as soon as it is done: an open connection, or a client that tries again
  // every so often, would not let Node finish. The first time counts as down (down starts as
  // true): that read goes to PostgreSQL, and the next ones use the cache as soon as it is ready.
  let opened = false;
  function open() {
    if (opened) return;
    opened = true;
    client.connect().catch(() => {});
  }

  // A command with a 200 ms limit (Redis answers in under a millisecond: if it takes longer,
  // something is wrong, and it is better to ask PostgreSQL). If it doesn't arrive in time, it fails
  // with an error. The command keeps waiting inside the client, but the request no longer waits.
  async function withinTime<T>(command: () => Promise<T>): Promise<T> {
    let clock: NodeJS.Timeout | undefined;
    const late = new Promise<never>((_, reject) => {
      clock = setTimeout(() => reject(new Error('no answer in 200 ms')), 200);
    });
    try {
      return await Promise.race([command(), late]);
    } finally {
      clearTimeout(clock);
    }
  }

  // What fromCache and forget use: the command, if the cache isn't down, and within the time.
  async function ask<T>(command: () => Promise<T>): Promise<T> {
    open();
    if (down) {
      probe();
      throw new Error('the cache is down');
    }
    try {
      return await withinTime(command);
    } catch (error) {
      markDown((error as Error).message);
      throw error;
    }
  }

  function probe() {
    if (!client.isReady || Date.now() - lastProbe < 1000) return;
    lastProbe = Date.now();
    withinTime(() => client.ping()).then(comeBack, () => {});
  }
  // #endregion down

  // Deletes those keys: the exact ones with DEL; the ones with *, with SCAN and DEL (forget, further
  // down).
  async function remove(keys: string[]): Promise<void> {
    const exact = keys.filter((key) => !key.includes('*'));
    if (exact.length > 0) await client.del(exact);
    for (const pattern of keys.filter((key) => key.includes('*'))) {
      for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        if (batch.length > 0) await client.del(batch);
      }
    }
  }

  // #region on-return
  // On coming back, the cache doesn't know what was lost: while it was down, the shop may have
  // changed products without deleting them from it (forget doesn't even ask), and Redis keeps what
  // it had (a network cut, a docker pause). So, before using it again, it deletes everything about
  // products (products:*: in this cache there is only catalogue, data.ts), with the same SCAN and
  // DEL as forget and the same 200 ms limit. If it can't, it stays down, and the next PING tries
  // again. It also happens the first time it connects: whatever was there from before this API
  // started (or from another copy), gone. Not FLUSHDB: it would delete everything in that Redis,
  // including what isn't the cache's.
  let returning = false;
  async function comeBack() {
    if (returning) return;
    returning = true;
    try {
      await withinTime(() => remove(['products:*']));
    } catch (error) {
      markDown((error as Error).message);
      return;
    } finally {
      returning = false;
    }
    down = false;
    markReady();
    if (warned) log.info('the cache is answering again');
    warned = false;
  }
  // #endregion on-return

  return {
    connect() {
      open();
      return connected;
    },
    // The first time, it waits for it to connect (like connect); afterwards, without the command
    // queue (disableOfflineQueue): with no connection, it fails at once. Whoever calls sets the
    // maximum time.
    async ping() {
      open();
      await connected;
      return client.ping();
    },
    // #region cache-aside
    // Cache-aside: the cache first. If it has the key, that is the answer, and PostgreSQL never
    // hears about it. If not, it is read from the database (read), stored in the cache for the next
    // ones, with its expiry, and returned. It is stored as JSON: Redis stores text.
    // If the cache fails, it is read from the database, just as without a cache: slower, never an
    // error.
    async fromCache<T>(key: string, seconds: number, read: () => Promise<T>): Promise<T> {
      let stored: string | null;
      try {
        stored = await ask(() => client.get(key));
      } catch (error) {
        log.debug({ key, reason: (error as Error).message }, 'cache: cannot read');
        return read();
      }
      if (stored !== null) return JSON.parse(stored) as T;
      const value = await read();
      // What doesn't exist (undefined, a product that isn't there) isn't stored: it is asked every time.
      if (value === undefined) return value;
      // It is stored without waiting: the answer is already there, and it needn't wait for Redis.
      // PX: the expiry, in milliseconds. After that time, Redis deletes the key by itself.
      ask(() => client.set(key, JSON.stringify(value), { PX: duration(seconds) })).catch(
        (error: Error) => log.debug({ key, reason: error.message }, 'cache: cannot store'),
      );
      return value;
    },
    // #endregion cache-aside

    // #region forget
    // Deletes those keys from the cache, so the next read goes to the database. It is called after
    // changing something in PostgreSQL (after the COMMIT): if it were deleted before, another
    // request could store the old data again between the delete and the change. Even so, a read that
    // started before the change can store the old data right after the delete: that is why
    // everything expires, and the old data lasts, at most, its TTL.
    // A key with * is a pattern, as in redis-cli: products:list:* is every list. Redis can't delete
    // by pattern: SCAN finds them, a hundred at a time, and DEL deletes them. Walking the keys is
    // cheap in a small cache like this one; with millions, another way would be used (a version in
    // the name of the list keys, which changes on invalidation, and the old ones expire).
    // All of it, with a single 200 ms limit. If the cache fails, the change in the database is
    // already done and isn't undone, and the response doesn't wait: the cache stays down, and on
    // coming back it deletes everything about products (on-return).
    async forget(...keys: string[]): Promise<void> {
      try {
        await ask(() => remove(keys));
      } catch (error) {
        log.debug({ keys, reason: (error as Error).message }, 'cache: cannot delete');
      }
    },
    // #endregion forget

    // Closes the connection without waiting for the commands on their way: in a cache, losing them
    // doesn't matter, and with a stuck cache they would never arrive.
    async close() {
      client.destroy();
    },
  };
}

// The shop's cache: the one in CACHE_URL, or none. server.ts closes it when shutting down.
export const cache = createCache(config.CACHE_URL);
export const { fromCache, forget } = cache;
