import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('hello.js says hello and tells the Node.js version', async () => {
  const { stdout } = await run('node', ['hello.js']);
  assert.match(stdout, /^Hello from Node\.js\nYou're using Node\.js v\d+\.\d+\.\d+\n$/);
});

test('read-products.js lists the three products', async () => {
  const { stdout } = await run('node', ['read-products.js']);
  assert.equal(stdout, 'The shop has 3 products:\n- T-shirt: 20 €\n- Mug: 8.5 €\n- Hoodie: 35 €\n');
});
