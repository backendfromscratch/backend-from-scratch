// The cache (Phase 9, lesson 2): the catalogue, kept for a while in another Redis (CACHE_URL), so
// PostgreSQL isn't asked the same thing on every request. The tests that need Redis use the one in
// REDIS_URL_TESTS (test/.env), on database 2 (the queue uses 1): without that variable, they are
// skipped. Each one empties that database when it starts.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  type AddressInfo,
  connect as connectTcp,
  createServer as createTcpServer,
  type Socket,
} from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Cache, createCache, duration } from '../src/cache.ts';
import { pool } from '../src/db.ts';
import { type RedisClient, connectRedis } from '../src/redis-store.ts';
import { useDb } from './db.ts';
import { ANA, CARMEN, asUser } from './identities.ts';

let ana: Record<string, string>;
let carmen: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
  carmen = await asUser(CARMEN);
});

// The tests' Redis, on database 2: redis://server:6379/1 becomes redis://server:6379/2.
const cacheUrl = (() => {
  if (!process.env.REDIS_URL_TESTS) return undefined;
  const url = new URL(process.env.REDIS_URL_TESTS);
  url.pathname = '/2';
  return url.toString();
})();
const noRedis = cacheUrl
  ? false
  : 'no Redis: put REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to test it';

// A client to look inside the cache from the tests: which keys there are and how long they have left.
let redis: RedisClient;
before(() => {
  if (cacheUrl) redis = connectRedis(cacheUrl);
});
after(async () => {
  await redis?.close();
});

/** A free port on 127.0.0.1: nobody is listening on it. */
async function freePort(): Promise<number> {
  const free = createTcpServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as AddressInfo).port;
  free.close();
  await once(free, 'close');
  return port;
}

/** Waits until the condition holds, or fails after the time. */
async function waitFor(condition: () => boolean, ms: number, what: string) {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) assert.fail(`after ${ms} ms, still not: ${what}`);
    await sleep(50);
  }
}

/** Like waitFor, with a condition that asks another process (Redis, the API). */
async function eventually(condition: () => Promise<boolean>, ms: number, what: string) {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) assert.fail(`after ${ms} ms, still not: ${what}`);
    await sleep(20);
  }
}

/** How long an async function takes in ms, and what it returns. */
async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const from = performance.now();
  const value = await run();
  return { ms: performance.now() - from, value };
}

/** A fake read function, which counts how many times it is called. */
function spy<T>(value: T) {
  const read = async () => {
    read.calls++;
    return value;
  };
  read.calls = 0;
  return read;
}

// #region no-cache
test('without CACHE_URL, it always reads from the database', async () => {
  const cache = createCache(undefined);
  const read = spy({ id: 1, name: 'T-shirt' });
  assert.deepEqual(await cache.fromCache('products:1', 60, read), { id: 1, name: 'T-shirt' });
  assert.deepEqual(await cache.fromCache('products:1', 60, read), { id: 1, name: 'T-shirt' });
  assert.equal(read.calls, 2);
  // Forgetting does nothing, and doesn't fail.
  await cache.forget('products:1', 'products:list:*');
  await cache.close();
});
// #endregion no-cache

test('the second read comes from the cache', { skip: noRedis }, async () => {
  await redis.flushDb();
  const cache = createCache(cacheUrl);
  await cache.connect();
  try {
    const read = spy([{ id: 1, name: 'T-shirt', priceCents: 2000 }]);
    const first = await cache.fromCache('products:list:{}', 60, read);
    const second = await cache.fromCache('products:list:{}', 60, read);
    // The database, only once: the second one, from Redis. The same, because it is a JSON copy.
    assert.equal(read.calls, 1);
    assert.deepEqual(second, first);
    assert.equal(
      await redis.get('products:list:{}'),
      '[{"id":1,"name":"T-shirt","priceCents":2000}]',
    );
    // What doesn't exist (undefined, a 404) isn't stored: it is asked every time.
    const nothing = spy(undefined);
    assert.equal(await cache.fromCache('products:999', 60, nothing), undefined);
    assert.equal(await cache.fromCache('products:999', 60, nothing), undefined);
    assert.equal(nothing.calls, 2);
    // Forgetting one key, and all the ones of a pattern (*).
    await redis.set('products:list:{"sort":"price"}', '[]');
    await redis.set('products:1', '{}');
    await redis.set('sessions:something-else', 'x');
    await cache.forget('products:1', 'products:list:*');
    assert.deepEqual(await redis.keys('*'), ['sessions:something-else']);
  } finally {
    await cache.close();
  }
});

// #region ttl
test('the TTL varies a little so they do not all expire at once', () => {
  // 60 seconds, plus up to 10 %: between 60,000 and 66,000 ms.
  assert.equal(
    duration(60, () => 0),
    60_000,
  );
  assert.equal(
    duration(60, () => 0.5),
    63_000,
  );
  assert.ok(duration(60, () => 0.9999) <= 66_000);
});

test(
  'in Redis, the keys stored at the same time expire spread out',
  { skip: noRedis },
  async () => {
    await redis.flushDb();
    const cache = createCache(cacheUrl);
    await cache.connect();
    try {
      // Twenty keys stored at the same time, as after deleting every list.
      for (let i = 0; i < 20; i++) await cache.fromCache(`products:${i}`, 60, async () => ({ i }));
      // fromCache stores without waiting: the last one, as soon as it arrives.
      await eventually(async () => (await redis.exists('products:19')) === 1, 2000, 'the last key');
      const left = await Promise.all(
        Array.from({ length: 20 }, (_, i) => redis.pTTL(`products:${i}`)),
      );
      for (const ms of left) assert.ok(ms > 59_000 && ms <= 66_000, `${ms} ms`);
      // Not all the same: they expire spread over six seconds, not at the same instant.
      assert.ok(new Set(left.map((ms) => Math.round(ms / 100))).size > 5, String(left));
    } finally {
      await cache.close();
    }
  },
);
// #endregion ttl

// #region cache-down
test('with the cache down, the products come from the database', async () => {
  // A cache that isn't there: nobody is listening on that port.
  const down = createCache(`redis://127.0.0.1:${await freePort()}`);
  try {
    // It opens the connection and has time to try it, as in an API that has been running for a
    // while (connect never resolves: nobody is there).
    void down.connect();
    await sleep(300);
    const read = spy([{ id: 1 }]);
    for (let i = 0; i < 5; i++) {
      // Each read, from the database, and without waiting for Redis: a moment at most.
      const { ms, value } = await timed(() => down.fromCache('products:list:{}', 60, read));
      assert.deepEqual(value, [{ id: 1 }]);
      assert.ok(ms < 500, `${ms} ms`);
    }
    assert.equal(read.calls, 5);
    // Forgetting fails inside, and doesn't throw: the change in the database is already done.
    const { ms } = await timed(() => down.forget('products:1', 'products:list:*'));
    assert.ok(ms < 500, `${ms} ms`);
  } finally {
    await down.close();
  }

  // And the real API, with CACHE_URL pointing at a cache that is down: 200, and a warning in the log.
  const api = await startApi({ CACHE_URL: `redis://127.0.0.1:${await freePort()}` });
  try {
    const { ms, value: res } = await timed(() => fetch(`${api.url}/v2/products/1`));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).name, 'T-shirt');
    assert.ok(ms < 1000, `${ms} ms`);
    // The connection opens with the first read, and the warning comes as soon as it fails.
    await waitFor(() => /"level":40.*cache/.test(api.output()), 2000, 'the warning in the log');
  } finally {
    await stop(api.process);
  }
});
// #endregion cache-down

/**
 * A fake Redis that hangs halfway, like a stopped Redis (docker pause) or a network that loses
 * what goes back. It answers what the client sends on connecting (+OK) and SCAN (no keys, so the
 * client accepts it on coming back). The first command with data (GET, SET, DEL) it receives and
 * does not answer, and from then on it answers nothing more on that connection. It has to be that
 * way: the client matches each reply with the oldest command still waiting, so a +OK to a later
 * PING would be taken as the answer to the stuck GET.
 */
async function hungRedis() {
  const connections = new Set<Socket>();
  const received: string[] = [];
  const server = createTcpServer((connection) => {
    connections.add(connection);
    let rest = '';
    let mute = false;
    connection.on('data', (chunk) => {
      // Each command arrives in RESP, Redis's format: *2\r\n$3\r\nGET\r\n$10\r\nproducts:1\r\n
      rest += chunk.toString('latin1');
      for (;;) {
        const command = readCommand(rest);
        if (!command) break;
        rest = rest.slice(command.length);
        received.push(command.name);
        if (['GET', 'SET', 'DEL'].includes(command.name)) mute = true;
        if (mute) continue;
        // SCAN: cursor 0 (no more) and no keys.
        connection.write(command.name === 'SCAN' ? '*2\r\n$1\r\n0\r\n*0\r\n' : '+OK\r\n');
      }
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `redis://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close() {
      for (const connection of connections) connection.destroy();
      server.close();
    },
  };
}

/** The first complete RESP command in the text: its name and how many characters it takes. */
function readCommand(text: string): { name: string; length: number } | undefined {
  const header = /^\*(\d+)\r\n/.exec(text);
  if (!header) return undefined;
  let position = header[0].length;
  const parts: string[] = [];
  for (let i = 0; i < Number(header[1]); i++) {
    const size = /^\$(\d+)\r\n/.exec(text.slice(position));
    if (!size) return undefined;
    const from = position + size[0].length;
    const to = from + Number(size[1]);
    if (text.length < to + 2) return undefined;
    parts.push(text.slice(from, to));
    position = to + 2;
  }
  return { name: parts[0]!.toUpperCase(), length: position };
}

/** Waits for the cache to be ready, or fails after two seconds. */
const readyInTwo = (cache: Cache) =>
  Promise.race([
    cache.connect(),
    sleep(2000).then(() => assert.fail('the cache never becomes ready')),
  ]);

test('with the cache stuck, it is not waited for either: a moment at most', async () => {
  const hung = await hungRedis();
  const cache = createCache(hung.url);
  try {
    // The client connects and is ready: as far as it knows, the cache is fine.
    await readyInTwo(cache);
    const read = spy([{ id: 1 }]);
    for (let i = 0; i < 3; i++) {
      const { ms, value } = await timed(() => cache.fromCache('products:list:{}', 60, read));
      assert.deepEqual(value, [{ id: 1 }]);
      assert.ok(ms < 500, `${ms} ms`);
    }
    assert.equal(read.calls, 3);
    const { ms } = await timed(() => cache.forget('products:1', 'products:list:*'));
    assert.ok(ms < 500, `${ms} ms`);
    // The commands reached the cache: it is the one that doesn't answer.
    assert.ok(hung.received.includes('GET'), String(hung.received));
  } finally {
    await cache.close();
    hung.close();
  }
});

test('forget does not wait for a stuck cache either', async () => {
  const hung = await hungRedis();
  const cache = createCache(hung.url);
  try {
    // Ready, and with no failed command yet: forget really asks it.
    await readyInTwo(cache);
    const { ms } = await timed(() => cache.forget('products:1', 'products:list:*'));
    assert.ok(ms < 500, `${ms} ms`);
    assert.ok(hung.received.includes('DEL'), String(hung.received));
  } finally {
    await cache.close();
    hung.close();
  }
});

/**
 * An intermediary between the client and the tests' Redis, to cut the network for a while: cut()
 * closes the connections and stops accepting others; reopen() accepts them again, on the same
 * port. Redis doesn't notice: what it had, it still has.
 */
async function redisWithCut(target: string) {
  const { hostname, port, pathname } = new URL(target);
  const connections = new Set<Socket>();
  const openServer = () =>
    createTcpServer((incoming) => {
      const outgoing = connectTcp(Number(port || 6379), hostname);
      for (const connection of [incoming, outgoing]) {
        connections.add(connection);
        connection.on('error', () => {});
        connection.on('close', () => {
          incoming.destroy();
          outgoing.destroy();
        });
      }
      incoming.pipe(outgoing).pipe(incoming);
    }).listen(listenPort, '127.0.0.1');
  let listenPort = 0;
  let server = openServer();
  await once(server, 'listening');
  listenPort = (server.address() as AddressInfo).port;
  return {
    url: `redis://127.0.0.1:${listenPort}${pathname}`,
    cut() {
      server.close();
      for (const connection of connections) connection.destroy();
      connections.clear();
    },
    async reopen() {
      server = openServer();
      await once(server, 'listening');
    },
  };
}

// #region on-return
test(
  'on coming back, the cache deletes everything about products: it does not know what was lost',
  { skip: noRedis },
  async () => {
    await redis.flushDb();
    const network = await redisWithCut(cacheUrl!);
    const cache = createCache(network.url);
    try {
      await readyInTwo(cache);
      // The mug, stored with the old price.
      await cache.fromCache('products:2', 60, async () => ({ id: 2, priceCents: 850 }));
      await eventually(async () => (await redis.exists('products:2')) === 1, 2000, 'the mug');
      await redis.set('sessions:something-else', 'x');
      // The network is cut. Meanwhile, the admin changes the price: forget can't delete it.
      network.cut();
      await eventually(
        async () => (await cache.fromCache('products:2', 60, async () => null)) === null,
        2000,
        'the cache takes itself as down',
      );
      await cache.forget('products:2', 'products:list:*');
      assert.equal(await redis.get('products:2'), '{"id":2,"priceCents":850}');
      // The network comes back: the client connects again and, before using it, deletes the products.
      await network.reopen();
      await eventually(async () => (await redis.exists('products:2')) === 0, 5000, 'the mug, gone');
      assert.deepEqual(await redis.keys('*'), ['sessions:something-else']);
      // And it is used again: the next read stores it again, now with the new price.
      await eventually(
        async () => {
          await cache.fromCache('products:2', 60, async () => ({ id: 2, priceCents: 900 }));
          return (await redis.exists('products:2')) === 1;
        },
        2000,
        'the cache, in use again',
      );
      assert.equal(await redis.get('products:2'), '{"id":2,"priceCents":900}');
    } finally {
      await cache.close();
      network.cut();
    }
  },
);
// #endregion on-return

/**
 * Starts the API on a free port, with the tests' environment plus what it is given (without
 * REDIS_URL, SMTP_URL or CACHE_URL unless they are set), and collects what it writes to the log.
 */
async function startApi(environment: Record<string, string>) {
  const port = await freePort();
  const { REDIS_URL: _r, SMTP_URL: _s, CACHE_URL: _c, ...base } = process.env;
  const child: ChildProcessWithoutNullStreams = spawn('node', ['src/server.ts'], {
    env: { ...base, LOG_LEVEL: 'info', PORT: String(port), ...environment },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  await waitFor(() => output.includes('The shop is listening'), 10_000, 'the API starts');
  return { process: child, output: () => output, url: `http://127.0.0.1:${port}` };
}

async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, 'exit');
}

// The API with the cache, for the tests that follow: they change products and orders, and look at
// what is left in Redis.
let api: Awaited<ReturnType<typeof startApi>> | undefined;
const shop = async () => {
  if (!api) {
    api = await startApi({ CACHE_URL: cacheUrl! });
    // Its cache connects a moment after startup, and until then it stores nothing: wait until it
    // stores the first product.
    const url = api.url;
    await eventually(
      async () => {
        await fetch(`${url}/v2/products/1`);
        return (await redis.exists('products:1')) === 1;
      },
      5000,
      'the API uses the cache',
    );
  }
  return api.url;
};
after(async () => {
  if (api) await stop(api.process);
});

/** A request to the API, with JSON if it has a body. */
async function send(
  method: string,
  path: string,
  who: Record<string, string> = {},
  body?: unknown,
) {
  return fetch(`${await shop()}${path}`, {
    method,
    headers: { ...who, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A product's stock, as the API gives it (from the cache, if it has it). */
const stockInApi = async (id: number) =>
  ((await (await send('GET', `/v2/products/${id}`)).json()) as { stock: number }).stock;

/** The cache emptied, with the API already started and using it. */
async function emptyCache() {
  await shop();
  await redis.flushDb();
}

type Price = { priceCents: number };
const keys = async () => (await redis.keys('products:*')).sort();

/**
 * Reads those paths until the cache's product keys are these. The API stores without waiting, and on
 * a busy machine one of its cache commands can take longer than the 200 ms limit: then it considers
 * the cache down, and while it is down a read goes to PostgreSQL without storing anything (it only
 * checks, once a second at most, whether the cache is back, and on its return it empties it). One
 * read isn't enough: it repeats them all until they are stored.
 */
async function readUntilKeysAre(paths: string[], expected: string[]) {
  const text = JSON.stringify(expected);
  await eventually(
    async () => {
      for (const path of paths) await send('GET', path);
      return JSON.stringify(await keys()) === text;
    },
    5000,
    `keys ${text}`,
  );
}

// #region invalidate
test('changing a product deletes it from the cache', { skip: noRedis }, async () => {
  await emptyCache();
  // Reading the list and a product leaves them in the cache.
  await send('GET', '/v2/products');
  await send('GET', '/v2/products?sort=-price');
  assert.equal(((await (await send('GET', '/v2/products/2')).json()) as Price).priceCents, 850);
  await readUntilKeysAre(
    ['/v2/products', '/v2/products?sort=-price', '/v2/products/2'],
    ['products:2', 'products:list:{"sort":"-price"}', 'products:list:{}'],
  );
  // The admin changes the mug's price: it and the lists, out.
  const change = await send('PATCH', '/v2/products/2', ana, { priceCents: 900 });
  assert.equal(change.status, 200);
  assert.deepEqual(await keys(), []);
  // The cache already answers with the new one: the next read goes to PostgreSQL and stores it.
  assert.equal(((await (await send('GET', '/v2/products/2')).json()) as Price).priceCents, 900);
  await readUntilKeysAre(['/v2/products/2'], ['products:2']);
  assert.equal(((await (await send('GET', '/v2/products/2')).json()) as Price).priceCents, 900);
  const list = (await (await send('GET', '/v2/products')).json()) as ({ id: number } & Price)[];
  assert.equal(list.find((product) => product.id === 2)!.priceCents, 900);
});

test('creating or deleting a product too', { skip: noRedis }, async () => {
  await emptyCache();
  const listBefore = (await (await send('GET', '/v2/products')).json()) as { id: number }[];
  await send('GET', '/v2/products/1');
  await readUntilKeysAre(['/v2/products', '/v2/products/1'], ['products:1', 'products:list:{}']);
  // The admin creates one: the lists, out (they are no longer the truth). Product 1 hasn't changed.
  const created = await send('POST', '/v2/products', ana, {
    name: 'Scarf',
    priceCents: 1800,
  });
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as { id: number };
  assert.deepEqual(await keys(), ['products:1']);
  const listAfter = (await (await send('GET', '/v2/products')).json()) as { id: number }[];
  assert.equal(listAfter.length, listBefore.length + 1);
  // Someone reads it (it stays in the cache) and the admin deletes it: it and the lists, out.
  assert.equal((await send('GET', `/v2/products/${id}`)).status, 200);
  await readUntilKeysAre(
    ['/v2/products/1', '/v2/products', `/v2/products/${id}`],
    ['products:1', `products:${id}`, 'products:list:{}'],
  );
  assert.equal((await send('DELETE', `/v2/products/${id}`, ana)).status, 204);
  assert.deepEqual(await keys(), ['products:1']);
  assert.equal((await send('GET', `/v2/products/${id}`)).status, 404);
  // Version 1 reads the same list from the cache.
  assert.equal((await send('GET', '/v1/products')).status, 200);
  await readUntilKeysAre(['/v1/products', '/v2/products/1'], ['products:1', 'products:list:{}']);
});

test('an order changes the stock and deletes it from the cache', { skip: noRedis }, async () => {
  await emptyCache();
  const before = await stockInApi(2);
  await send('GET', '/v2/products');
  await readUntilKeysAre(['/v2/products/2', '/v2/products'], ['products:2', 'products:list:{}']);
  const res = await send('POST', '/v2/orders', carmen, { productId: 2, quantity: 3 });
  assert.equal(res.status, 201);
  // The stock has changed: the product and the lists (which carry it too), out.
  assert.deepEqual(await keys(), []);
  assert.equal(await stockInApi(2), before - 3);
});

test('cancelling an order too', { skip: noRedis }, async () => {
  await emptyCache();
  const res = await send('POST', '/v2/orders', carmen, { productId: 3, quantity: 2 });
  assert.equal(res.status, 201);
  const { id } = (await res.json()) as { id: number };
  const before = await stockInApi(3);
  await send('GET', '/v2/products');
  await readUntilKeysAre(['/v2/products/3', '/v2/products'], ['products:3', 'products:list:{}']);
  assert.equal((await send('POST', `/v2/orders/${id}/cancellation`, carmen)).status, 200);
  // Cancelling gives the stock back: out of the cache.
  assert.deepEqual(await keys(), []);
  assert.equal(await stockInApi(3), before + 2);
});

test(
  'buying checks the stock in the database even if the cache says otherwise',
  { skip: noRedis },
  async () => {
    await emptyCache();
    await pool.query('UPDATE products SET stock = 2 WHERE id = 4');
    // A wrong cache: it says 1000 caps are left.
    const cap = (await (await send('GET', '/v2/products/4')).json()) as { stock: number };
    await readUntilKeysAre(['/v2/products/4'], ['products:4']);
    await redis.set('products:4', JSON.stringify({ ...cap, stock: 1000 }));
    assert.equal(await stockInApi(4), 1000);
    // Buying 5 doesn't trust it: PostgreSQL checks it, in the order's transaction.
    const res = await send('POST', '/v2/orders', carmen, { productId: 4, quantity: 5 });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { detail: string }).detail, 'You ask for 5 and 2 are left');
    const { rows } = await pool.query('SELECT stock FROM products WHERE id = 4');
    assert.equal(rows[0].stock, 2);
  },
);
// #endregion invalidate
