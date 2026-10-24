// The limits when their store fails (Phase 10, lesson 6). Up to step 45, a frozen Redis
// (docker compose pause redis) left signing in waiting forever: the limiter asked it and nobody
// answered. Now each question has a maximum time, and each limit says what to do if there is no
// answer: close (let nobody through: 503) or open (let through, and say so in the log).
// A truly frozen Redis can't be set up in a test: a store that never answers is used, which is what
// the limiter sees. The real docker pause is done in lesson 7.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { log } from '../src/log.ts';
import {
  createLimiter,
  createMemoryStore,
  type Limit,
  type LimitStore,
  LimitsUnavailable,
  store,
} from '../src/rate-limits.ts';
import { useDb } from './db.ts';

useDb();

const never = () => new Promise<never>(() => {});
// A store that never answers: a frozen Redis.
const frozen: LimitStore = { attempts: never, record: never };
// A store that gives an error: Redis down, with no connection.
const broken: LimitStore = {
  attempts: async () => {
    throw new Error('ECONNREFUSED');
  },
  record: async () => {
    throw new Error('ECONNREFUSED');
  },
};

const limit = (onFailure: Limit['onFailure']): Limit => ({
  name: 'test',
  max: 3,
  window: 60,
  onFailure,
});

for (const [case_, failingStore] of [
  ["doesn't answer", frozen],
  ['gives an error', broken],
] as const) {
  test(`closed, with a store that ${case_}: LimitsUnavailable in under wait + 50 ms`, async (t) => {
    t.mock.method(log, 'warn', () => {});
    const limiter = createLimiter(limit('closed'), failingStore, Date.now, 100);
    const before = performance.now();
    await assert.rejects(limiter.check('ana'), LimitsUnavailable);
    assert.ok(performance.now() - before < 150, `${performance.now() - before} ms`);
    await assert.rejects(limiter.record('ana'), LimitsUnavailable);
  });

  test(`open, with a store that ${case_}: lets through, and a single log warning per second`, async (t) => {
    const warning = t.mock.method(log, 'warn', () => {});
    // The limiter's clock is the test's: ten calls within the same second.
    let now = 1_000_000;
    const limiter = createLimiter(limit('open'), failingStore, () => now, 20);
    for (let time = 0; time < 10; time++) {
      const state = await limiter.check('ana');
      assert.deepEqual(state, { allowed: true, left: 3, retryIn: 0, resetIn: 0 });
      await limiter.record('ana');
      now += 50;
    }
    assert.equal(warning.mock.callCount(), 1);
    assert.equal((warning.mock.calls[0]!.arguments[0] as { limit: string }).limit, 'test');
    // Once the second has passed, another warning.
    now += 1000;
    await limiter.check('ana');
    assert.equal(warning.mock.callCount(), 2);
  });
}

test('with the store frozen, pending commands do not pile up: one probe per second', async (t) => {
  t.mock.method(log, 'warn', () => {});
  // How many times it has been asked: each one is a command waiting in the Redis client.
  let pending = 0;
  const counted: LimitStore = {
    attempts: () => {
      pending++;
      return never();
    },
    record: () => {
      pending++;
      return never();
    },
  };
  let now = 0;
  const limiter = createLimiter(limit('closed'), counted, () => now, 20);
  // 200 sign-ins in 2 seconds: check and, afterwards, record the failure.
  const before = performance.now();
  for (let time = 0; time < 200; time++) {
    await assert.rejects(limiter.check('ana'), LimitsUnavailable);
    await assert.rejects(limiter.record('ana'), LimitsUnavailable);
    now += 10;
  }
  // The first one and a probe per second: two, not 400. And almost all of them, at once.
  assert.equal(pending, 2);
  assert.ok(performance.now() - before < 500, `${performance.now() - before} ms`);
});

test('when the store comes back, the probe notices and it is asked again', async (t) => {
  t.mock.method(log, 'warn', () => {});
  let frozenNow = true;
  let questions = 0;
  const memory = createMemoryStore();
  const sometimes: LimitStore = {
    attempts: (key, since) => {
      questions++;
      return frozenNow ? never() : memory.attempts(key, since);
    },
    record: (key, instant) => {
      questions++;
      return frozenNow ? never() : memory.record(key, instant);
    },
  };
  let now = 0;
  const limiter = createLimiter(limit('closed'), sometimes, () => now, 20);
  await assert.rejects(limiter.check('ana'), LimitsUnavailable);
  frozenNow = false;
  // Before the second, it isn't even asked, even if it already answers.
  now = 500;
  await assert.rejects(limiter.check('ana'), LimitsUnavailable);
  assert.equal(questions, 1);
  // At the second, the probe answers: it is back, and everything goes on as always.
  now = 1000;
  assert.equal((await limiter.check('ana')).left, 3);
  await limiter.record('ana');
  assert.equal((await limiter.check('ana')).left, 2);
  assert.equal(questions, 4);
});

test('with a store that answers, nothing changes: it counts and does not warn', async (t) => {
  const warning = t.mock.method(log, 'warn', () => {});
  const limiter = createLimiter(limit('closed'));
  await limiter.record('ana');
  assert.equal((await limiter.check('ana')).left, 2);
  assert.equal(warning.mock.callCount(), 0);
});

// The routes, with the shop's store frozen: its two functions never answer.
const from = (ip: string) => ({ incoming: { socket: { remoteAddress: ip } } });
function freezeStore() {
  mock.method(log, 'warn', () => {});
  mock.method(store, 'attempts', never);
  mock.method(store, 'record', never);
}

test('signing in without being able to check the attempts: a quick 503, with Retry-After', async (t) => {
  freezeStore();
  t.after(() => mock.restoreAll());
  const before = performance.now();
  const res = await app.request(
    '/v2/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'carmen@example.com', password: 'carmen-practice-2026' }),
    },
    from('203.0.113.40'),
  );
  assert.ok(performance.now() - before < 1000, `${performance.now() - before} ms`);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '5');
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).title, "The attempts can't be checked");
  // Not even the right password opens a session.
  assert.equal(res.headers.get('set-cookie'), null);
});

test('creating an account without being able to check the attempts: 201 (that limit opens)', async (t) => {
  freezeStore();
  t.after(() => mock.restoreAll());
  const res = await app.request(
    '/v2/accounts',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'without-redis@example.com',
        password: 'a long test phrase',
      }),
    },
    from('203.0.113.41'),
  );
  assert.equal(res.status, 201);
});
