import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { createOrder } from '../src/data.ts';
import { inTransaction, pool } from '../src/db.ts';
import { run, useDb } from './db.ts';

useDb();

const send = (productId: number, quantity: number) =>
  app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity }),
  });

const stock = async (productId: number) =>
  (await pool.query('SELECT stock FROM products WHERE id = $1', [productId])).rows[0].stock;

test('20 orders at once for a product with stock 5: 5 go through, 15 get 409, and the stock ends at 0', async () => {
  await pool.query('UPDATE products SET stock = 5 WHERE id = 4');
  const responses = await Promise.all(Array.from({ length: 20 }, () => send(4, 1)));
  const codes = responses.map((res) => res.status);
  assert.equal(codes.filter((code) => code === 201).length, 5);
  assert.equal(codes.filter((code) => code === 409).length, 15);
  assert.equal(await stock(4), 0);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM orders WHERE product_id = 4');
  assert.equal(rows[0].n, 5);
});

test('without enough stock: 409, with its own type and what is left in detail', async () => {
  await pool.query('UPDATE products SET stock = 2 WHERE id = 3');
  const res = await send(3, 3);
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(await res.json(), {
    type: 'https://shop.example/problems/out-of-stock',
    title: 'Not enough stock left',
    status: 409,
    detail: 'You ask for 3 and 2 are left',
  });
  assert.equal(await stock(3), 2, 'the stock does not change');
});

test('an order takes its quantity from the stock; cancelling it gives it back, only once', async () => {
  const before = await stock(1);
  const order = await (await send(1, 2)).json();
  assert.equal(await stock(1), before - 2);
  for (let time = 1; time <= 2; time++) {
    const res = await app.request(`/v2/orders/${order.id}/cancellation`, { method: 'POST' });
    assert.equal((await res.json()).status, 'cancelled');
  }
  assert.equal(await stock(1), before);
});

test('an error halfway through the transaction leaves the stock as it was', async () => {
  const before = await stock(1);
  // A negative quantity wouldn't pass the API's validation, but here it's useful: the stock UPDATE
  // works (it adds 3) and the order's INSERT fails because of its CHECK (quantity > 0). ROLLBACK
  // undoes the UPDATE.
  await assert.rejects(createOrder(1, -3), { code: '23514' });
  assert.equal(await stock(1), before);
});

test('inTransaction: if the function throws an error, nothing it did is saved', async () => {
  const before = await stock(2);
  await assert.rejects(
    inTransaction(async (client) => {
      await client.query('UPDATE products SET stock = 0 WHERE id = 2');
      throw new Error('something fails after the UPDATE');
    }),
    /something fails after the UPDATE/,
  );
  assert.equal(await stock(2), before);
});

test('examples/race.ts: reading and writing separately oversells; with a conditional UPDATE, it does not', async () => {
  const { stdout } = await run('node', ['examples/race.ts']);
  assert.match(stdout, /^Wrong: there was 1 mug left and 10 sold\. Stock: 0$/m);
  assert.match(stdout, /^Right: there was 1 mug left and 1 sold\. Stock: 0$/m);
});

test('the contract documents the 409 of POST /orders', async () => {
  const doc = await (await app.request('/v2/openapi.json')).json();
  assert.deepEqual(Object.keys(doc.paths['/orders'].post.responses), ['201', '409', '422']);
});
