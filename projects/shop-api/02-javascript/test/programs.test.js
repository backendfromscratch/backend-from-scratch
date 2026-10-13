import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('products.js filters, calculates, and goes to JSON and back', async () => {
  const { stdout } = await run('node', ['products.js']);
  assert.equal(
    stdout,
    [
      'Under 25 €: T-shirt, Mug',
      'Two T-shirts: 40 €',
      'Two Mugs: 17 €',
      'Two Hoodies: 70 €',
      '{"id":2,"name":"Mug","price":8.5}',
      'From text to object: Cap, 15 €',
      '',
    ].join('\n'),
  );
});

test('wait.js waits for the file before going on', async () => {
  const { stdout } = await run('node', ['wait.js']);
  assert.equal(stdout, 'Before reading the file\nThe file has 3 products\n');
});
