import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';

const run = promisify(execFile);

test('an unexpected error: 500 without details, with the request id', async () => {
  const res = await app.request('/error');
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['error', 'requestId']);
  assert.equal(body.error, 'Internal server error');
  assert.equal(res.headers.get('x-request-id'), body.requestId);
  assert.doesNotMatch(JSON.stringify(body), /on purpose|at /);
});

test('a route that does not exist: 404 in JSON', async () => {
  const res = await app.request('/offers');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No such route' });
});

test('a body that is not JSON: 400, in JSON too', async () => {
  const res = await app.request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'this is not JSON',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: 'The request cannot be read',
    detail: 'Malformed JSON in request body',
  });
});

test('the token comes from the environment variable', async () => {
  assert.equal(config.ADMIN_TOKEN, 'test-token-0123456789abcdef');
  const res = await app.request('/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ADMIN_TOKEN}` },
    body: '{"name":"Cap","price":15}',
  });
  assert.equal(res.status, 201);
});

test('without ADMIN_TOKEN, the server does not start and says why', async () => {
  const result = await run('node', ['src/server.ts'], {
    env: { PATH: process.env.PATH },
  }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Configuration: ADMIN_TOKEN: ADMIN_TOKEN is missing/);
});

test('each request writes a JSON line with its id', async () => {
  const code = `
    const { app } = await import('./src/app.ts');
    await app.request('/products/2', { headers: { 'X-Request-Id': 'test-1' } });
  `;
  const { stdout } = await run('node', ['--input-type=module', '-e', code], {
    env: { ...process.env, LOG_LEVEL: 'info' },
  });
  const line = JSON.parse(stdout.trim().split('\n').at(-1)!);
  assert.equal(line.msg, 'request');
  assert.equal(line.requestId, 'test-1');
  assert.equal(line.path, '/products/2');
  assert.equal(line.status, 200);
  assert.equal(line.level, 30);
});
