// The health checks (Phase 10, lesson 6): /health/live (does the process answer?) and
// /health/ready (can it serve: do PostgreSQL and the queue's Redis answer?). And a failure of a
// dependency that no longer brings the API down: the error of a borrowed PostgreSQL connection
// (db.ts).
// To make the database fail or not answer, pool.query is changed in the test (mock.method): a truly
// frozen PostgreSQL is tried in the lesson, with docker compose pause db.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { cache } from '../src/cache.ts';
import { config } from '../src/config.ts';
import { pool } from '../src/db.ts';
import { checks } from '../src/health.ts';
import { useDb } from './db.ts';

useDb();

const never = () => new Promise<never>(() => {});

test('GET /health/live: 200, without asking anybody', async () => {
  const res = await app.request('/health/live');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /health/live: 200 even if PostgreSQL fails', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('ECONNREFUSED');
  });
  const res = await app.request('/health/live');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test("GET /health/ready: 200 with what answers; what isn't configured doesn't count", async () => {
  const res = await app.request('/health/ready');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.checks.db, 'ok');
  // Without REDIS_URL or CACHE_URL (the tests don't set them), the shop works without them.
  assert.deepEqual(body.checks, {
    db: 'ok',
    queue: process.env.REDIS_URL ? 'ok' : 'not-configured',
    cache: process.env.CACHE_URL ? 'ok' : 'not-configured',
  });
});

test("GET /health/ready: 503 with db: failing, in under 1 s, if PostgreSQL doesn't answer", async (t) => {
  t.mock.method(pool, 'query', never);
  const before = performance.now();
  const res = await app.request('/health/ready');
  assert.ok(performance.now() - before < 1000, `${performance.now() - before} ms`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.status, 'failing');
  assert.equal(body.checks.db, 'failing');
});

test("GET /health/ready: 503 if the queue's Redis fails", async (t) => {
  t.mock.method(checks, 'queue', async () => {
    throw new Error('ECONNREFUSED');
  });
  const res = await app.request('/health/ready');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).checks.queue, 'failing');
});

test('GET /health/ready: a failing cache is reported, but does not make it fail (200)', async (t) => {
  // A cache that is configured and frozen: its PING doesn't answer until it's released, at the end.
  const noCache = config.CACHE_URL;
  config.CACHE_URL = 'redis://cache:6379';
  t.after(() => {
    config.CACHE_URL = noCache;
  });
  const { promise: frozen, resolve: release } = Promise.withResolvers<string>();
  const ping = t.mock.method(cache, 'ping', () => frozen);
  for (let time = 0; time < 3; time++) {
    const res = await app.request('/health/ready');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.checks.cache, 'failing');
  }
  // Three questions, a single PING: the other two waited on the one that was still unanswered.
  assert.equal(ping.mock.callCount(), 1);
  release('PONG');
});

test('GET /health does not change: 200 {"status":"ok"} when PostgreSQL answers', async () => {
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test("db.ts: a borrowed connection's error doesn't stop the API, and is said once in the log", async (t) => {
  // That is how the shop learns that PostgreSQL has cut a connection it was using (for example,
  // because of idle_in_transaction_session_timeout, in outbox.ts). With nobody listening to the
  // 'error', emit would throw the error, and in the real API, Node would stop the process.
  const warning = t.mock.method(console, 'warn', () => {});
  const client = await pool.connect();
  try {
    assert.doesNotThrow(() =>
      client.emit('error', new Error('terminating connection due to idle-in-transaction timeout')),
    );
    assert.equal(warning.mock.callCount(), 1);
    assert.match(String(warning.mock.calls[0]!.arguments.join(' ')), /idle-in-transaction/);
  } finally {
    // true: the connection doesn't go back to the pool, it is closed (as pg would with a failed one).
    client.release(true);
  }
  mock.restoreAll();
});
