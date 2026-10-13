import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { findProduct, total } from '../src/products.ts';

const run = promisify(execFile);

test('findProduct finds a product or returns undefined', () => {
  assert.equal(findProduct(2)?.name, 'Mug');
  assert.equal(findProduct(99), undefined);
});

test('total multiplies the price by the quantity', () => {
  assert.equal(total({ id: 1, name: 'T-shirt', price: 20 }, 3), 60);
});

test('main.ts runs without compiling', async () => {
  const { stdout } = await run('node', ['src/main.ts']);
  assert.equal(stdout, 'Order 1: 3 × Mug = 25.5 €\nA product has arrived: Cap\n');
});

test('tsc finds the error in the example, and Node runs it anyway', async () => {
  const tsc = await run('npx', ['tsc', '-p', 'examples']).catch((error) => error);
  assert.match(tsc.stdout, /error TS2322: Type 'string' is not assignable to type 'number'/);
  const { stdout } = await run('node', ['examples/type-error.ts']);
  assert.equal(stdout, '17\n');
});
