import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { type LimitStore, createLimiter, createMemoryStore } from '../src/rate-limits.ts';
import { run, useDb } from './db.ts';

useDb();

// Each test makes its requests from its own IP: that way one's limits don't count in another.
// With app.request there's no real connection; the IP goes where getConnInfo looks for it.
const from = (ip: string) => ({ incoming: { socket: { remoteAddress: ip } } });

const signIn = (ip: string, email: string, password: string) =>
  app.request(
    '/v2/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    from(ip),
  );

test('the eleventh failed attempt with the same email: 429 with Retry-After, even if the password is right', async () => {
  const ip = '203.0.113.1';
  for (let time = 1; time <= 10; time++) {
    const res = await signIn(ip, 'luis@shop.example', 'not-the-password');
    assert.equal(res.status, 400, `attempt ${time}`);
    assert.match(
      res.headers.get('ratelimit')!,
      new RegExp(`"session-email";r=${10 - time};t=\\d+`),
    );
  }
  const blocked = await signIn(ip, 'LUIS@shop.example', 'luis-practice-2026');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('content-type'), 'application/problem+json');
  assert.equal((await blocked.json()).type, 'https://shop.example/problems/too-many-attempts');
  const wait = Number(blocked.headers.get('retry-after'));
  assert.ok(wait > 0 && wait <= 15 * 60, `Retry-After: ${wait}`);
  assert.equal(
    blocked.headers.get('ratelimit-policy'),
    '"session-email";q=10;w=900, "session-ip";q=30;w=900',
  );
  assert.equal(blocked.headers.get('set-cookie'), null);
});

test('another email from the same IP has its own count; the IP, its own, with a higher limit', async () => {
  const ip = '203.0.113.2';
  for (let time = 1; time <= 10; time++) await signIn(ip, 'carmen@example.com', 'wrong');
  assert.equal((await signIn(ip, 'carmen@example.com', 'wrong')).status, 429);
  const other = await signIn(ip, 'pablo@example.com', 'pablo-practice-2026');
  assert.equal(other.status, 200);
  // Failures of many emails from one IP: on reaching 30, the IP stops too.
  for (let time = 1; time <= 20; time++) await signIn(ip, `nobody${time}@example.com`, 'wrong');
  const res = await signIn(ip, 'pablo@example.com', 'pablo-practice-2026');
  assert.equal(res.status, 429);
  assert.match(res.headers.get('ratelimit')!, /"session-ip";r=0;/);
});

test('creating accounts: at most 5 per hour from the same IP', async () => {
  const signUp = (n: number) =>
    app.request(
      '/v2/accounts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `new${n}@example.com`,
          password: 'a long test sentence here',
        }),
      },
      from('203.0.113.3'),
    );
  for (let n = 1; n <= 5; n++) assert.equal((await signUp(n)).status, 201);
  const sixth = await signUp(6);
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.headers.get('retry-after')) > 0);
});

test('the window slides: once the oldest attempt is past, one fits again', async () => {
  let now = 0;
  const limiter = createLimiter({ name: 'test', max: 3, window: 60 }, undefined, () => now);
  for (const instant of [0, 20_000, 40_000]) {
    now = instant;
    await limiter.record('ana');
  }
  now = 50_000;
  const full = await limiter.check('ana');
  assert.deepEqual(full, { allowed: false, left: 0, retryIn: 10, resetIn: 10 });
  now = 60_001; // the one at 0 has already left the window; the ones at 20 and 40, not
  assert.deepEqual(await limiter.check('ana'), {
    allowed: true,
    left: 1,
    retryIn: 0,
    resetIn: 20,
  });
  // Another key, another count.
  assert.equal((await limiter.check('luis')).left, 3);
});

test('the store can be swapped for another (Redis, in Phase 7) without touching the limiter', async () => {
  const calls: string[] = [];
  const memory = createMemoryStore();
  const withLog: LimitStore = {
    attempts: (key, since) => {
      calls.push(`attempts ${key}`);
      return memory.attempts(key, since);
    },
    record: (key, instant) => {
      calls.push(`record ${key}`);
      return memory.record(key, instant);
    },
  };
  const limiter = createLimiter({ name: 'test', max: 1, window: 60 }, withLog);
  await limiter.record('ana');
  assert.equal((await limiter.check('ana')).allowed, false);
  assert.deepEqual(calls, ['record test:ana', 'attempts test:ana']);
});

test('without a secret, with a short one or with the example one, the server does not start', async () => {
  const cases = [
    [undefined, /WEBHOOK_SECRET: WEBHOOK_SECRET is missing/],
    ['short', /WEBHOOK_SECRET is too short/],
    ['change-this-to-a-secret-from-openssl-rand', /WEBHOOK_SECRET is the example one/],
  ] as const;
  for (const [value, message] of cases) {
    const { WEBHOOK_SECRET, ...rest } = process.env;
    const env = value === undefined ? rest : { ...rest, WEBHOOK_SECRET: value };
    const result = await run('node', ['src/server.ts'], { env }).catch((error) => error);
    assert.equal(result.code, 1);
    assert.match(result.stderr, message);
  }
});
