import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { useDb } from './db.ts';

useDb();

const run = promisify(execFile);

// The API no longer has a route that fails on purpose: the test adds its own.
app.get('/error-test', () => {
  throw new Error('Something failed on purpose');
});

test('an unexpected error: 500 without details, with the request id in instance', async () => {
  const res = await app.request('/error-test');
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['type', 'title', 'status', 'detail', 'instance']);
  assert.equal(body.title, 'Internal Server Error');
  assert.equal(body.instance, `urn:uuid:${res.headers.get('x-request-id')}`);
  assert.match(body.instance, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(body), /on purpose|at /);
});

test('the secrets come from the environment variables', () => {
  assert.equal(config.WEBHOOK_SECRET, 'test-secret-0123456789abcdef');
  assert.equal(config.OIDC_CLIENT_SECRET, 'test-secret-0123456789abcdef');
});

test('without WEBHOOK_SECRET, the server does not start and says why', async () => {
  const result = await run('node', ['src/server.ts'], {
    env: { PATH: process.env.PATH },
  }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Configuration: WEBHOOK_SECRET: WEBHOOK_SECRET is missing/);
});

test('each request writes a JSON line with its id', async () => {
  const code = `
    const { app } = await import('./src/app.ts');
    await app.request('/v2/products/2', { headers: { 'X-Request-Id': 'test-1' } });
    await (await import('./src/db.ts')).pool.end();
  `;
  const { stdout } = await run('node', ['--input-type=module', '-e', code], {
    env: { ...process.env, LOG_LEVEL: 'info' },
  });
  const line = JSON.parse(stdout.trim().split('\n').at(-1)!);
  assert.equal(line.msg, 'request');
  assert.equal(line.requestId, 'test-1');
  assert.equal(line.path, '/v2/products/2');
  assert.equal(line.status, 200);
  assert.equal(line.level, 30);
});
