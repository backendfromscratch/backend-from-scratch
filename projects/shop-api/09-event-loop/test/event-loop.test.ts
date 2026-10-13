import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';

const run = promisify(execFile);

/** Sends two requests at once and returns the order in which they finish. */
async function finishOrder(slow: string): Promise<string[]> {
  const finished: string[] = [];
  const request = async (path: string) => {
    await app.request(path);
    finished.push(path);
  };
  await Promise.all([request(slow), request('/products')]);
  return finished;
}

test('/slow blocks: /products has to wait until it finishes', async () => {
  assert.deepEqual(await finishOrder('/slow'), ['/slow', '/products']);
});

test('/slow-async does not block: /products finishes first', async () => {
  assert.deepEqual(await finishOrder('/slow-async'), ['/products', '/slow-async']);
});

test('the two slow routes answer with how long they took', async () => {
  for (const path of ['/slow', '/slow-async']) {
    const { ms } = await (await app.request(path)).json();
    assert.ok(ms > 0, path);
  }
});

test('examples/order.ts: first the code, then the promise, last the timer', async () => {
  const { stdout } = await run('node', ['examples/order.ts']);
  assert.deepEqual(stdout.trim().split('\n'), [
    '1. The program starts',
    '2. The code ends, from top to bottom',
    '3. The promise that is already resolved',
    '4. The timer, even though it is 0 ms',
  ]);
});
