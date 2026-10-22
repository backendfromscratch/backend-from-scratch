// The limits' store in Redis, against a real Redis: the one in REDIS_URL_TESTS (test/.env).
// Without that variable, these tests are skipped, and npm test works without Redis; CI does set it.
// Each test uses its own prefix, so it doesn't touch anything else in that Redis.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createLimiter } from '../src/rate-limits.ts';
import { type RedisClient, connectRedis, createRedisStore } from '../src/redis-store.ts';
import { run } from './db.ts';

const url = process.env.REDIS_URL_TESTS;
const noRedis = url
  ? false
  : 'no Redis: put REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to test it';

// Two clients: like two copies of the API, each with its own connection to the same Redis.
let one: RedisClient;
let other: RedisClient;

before(() => {
  if (!url) return;
  one = connectRedis(url);
  other = connectRedis(url);
});

after(async () => {
  await one?.close();
  await other?.close();
});

const prefix = () => `test-${randomUUID()}:`;

test(
  "Redis gives the window's attempts, from oldest to newest, and forgets the rest",
  { skip: noRedis },
  async () => {
    const store = createRedisStore(one, prefix());
    for (const instant of [1000, 3000, 2000]) await store.record('ana', instant);
    assert.deepEqual(await store.attempts('ana', 0), [1000, 2000, 3000]);
    // "After since": the one at 1000 no longer counts, and Redis deletes it.
    assert.deepEqual(await store.attempts('ana', 1000), [2000, 3000]);
    assert.deepEqual(await store.attempts('ana', 0), [2000, 3000]);
    assert.deepEqual(await store.attempts('luis', 0), []);
  },
);

test(
  'two copies of the API with the same Redis keep a single count',
  { skip: noRedis },
  async () => {
    const shared = prefix();
    const limit = { name: 'session-email', max: 10, window: 15 * 60 };
    const copyOne = createLimiter(limit, createRedisStore(one, shared));
    const copyOther = createLimiter(limit, createRedisStore(other, shared));
    // Ten failures, half in each copy.
    for (let time = 1; time <= 5; time++) {
      await copyOne.record('luis@shop.example');
      await copyOther.record('luis@shop.example');
    }
    assert.equal((await copyOne.check('luis@shop.example')).allowed, false);
    assert.equal((await copyOther.check('luis@shop.example')).allowed, false);
    // With the memory, each copy would have seen only 5.
    assert.equal((await copyOther.check('ana@shop.example')).left, 10);
  },
);

test(
  'two attempts in the same millisecond count as two, and the key expires on its own',
  { skip: noRedis },
  async () => {
    const p = prefix();
    const store = createRedisStore(one, p);
    await Promise.all([store.record('ana', 5000), store.record('ana', 5000)]);
    assert.deepEqual(await store.attempts('ana', 0), [5000, 5000]);
    const expires = await one.pTTL(`${p}ana`);
    assert.ok(expires > 0 && expires <= 24 * 60 * 60 * 1000, `expires in ${expires} ms`);
  },
);

test("with REDIS_URL, the shop's limits are kept in Redis", { skip: noRedis }, async () => {
  const email = `${randomUUID()}@example.com`;
  // Another process, with REDIS_URL: the same startup as the API in Docker Compose.
  const code = `
    const { limits } = await import('./src/rate-limits.ts');
    await limits.signInByEmail.record(${JSON.stringify(email)});
    process.exit(0);
  `;
  await run('node', ['--input-type=module', '-e', code], {
    env: { ...process.env, REDIS_URL: url },
  });
  const key = `limits:session-email:${email}`;
  assert.equal(await one.zCard(key), 1);
  await one.del(key);
});
