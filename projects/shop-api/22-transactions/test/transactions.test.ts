import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { changeQuantity, changeStatus, createOrder, findOrder } from '../src/data.ts';
import { inTransaction, pool } from '../src/db.ts';
import { sign } from '../src/signature.ts';
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

const change = (id: number, quantity: number) =>
  app.request(`/v2/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });

const cancel = (id: number) => app.request(`/v2/orders/${id}/cancellation`, { method: 'POST' });

// A payment notice from the gateway, signed, with a new event id each time.
const pay = (orderId: number) => {
  const body = JSON.stringify({ id: randomUUID(), type: 'payment.completed', orderId });
  return app.request('/v2/webhooks/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(body, config.WEBHOOK_SECRET),
    },
    body,
  });
};

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

test('asking for more units of a pending order takes the difference from the stock', async () => {
  const before = await stock(1);
  const order = await (await send(1, 2)).json();
  const res = await change(order.id, 5);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).quantity, 5);
  assert.equal(await stock(1), before - 5);
});

test('asking for more units than are left: 409, with what is left, and neither the order nor the stock changes', async () => {
  await pool.query('UPDATE products SET stock = 3 WHERE id = 3');
  const order = await (await send(3, 2)).json(); // 1 left
  const res = await change(order.id, 4); // 2 more
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(await res.json(), {
    type: 'https://shop.example/problems/out-of-stock',
    title: 'Not enough stock left',
    status: 409,
    detail: 'You ask for 2 more and 1 are left',
  });
  assert.equal((await findOrder(order.id))!.quantity, 2);
  assert.equal(await stock(3), 1);
});

test('asking for fewer units gives the difference back to the stock', async () => {
  const before = await stock(1);
  const order = await (await send(1, 5)).json();
  const res = await change(order.id, 2);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).quantity, 2);
  assert.equal(await stock(1), before - 2);
});

test('changing the quantity and then cancelling leaves the stock as it was before the order', async () => {
  const before = await stock(1);
  const order = await (await send(1, 1)).json();
  assert.equal((await change(order.id, 4)).status, 200);
  assert.equal((await change(order.id, 3)).status, 200);
  assert.equal((await cancel(order.id)).status, 200);
  assert.equal(await stock(1), before);
});

test('changing the quantity and cancelling at the same time: the stock ends as before the orders', async () => {
  const before = await stock(2);
  const ids: number[] = [];
  for (let time = 1; time <= 10; time++) ids.push((await (await send(2, 1)).json()).id);
  // Each order gets both requests at the same time: the change can arrive before (200) or after
  // the cancellation (409). Whatever happens, in the end all the stock is back.
  const responses = await Promise.all(ids.flatMap((id) => [change(id, 3), cancel(id)]));
  for (const res of responses) assert.ok([200, 409].includes(res.status), `${res.status}`);
  for (const id of ids) assert.equal((await findOrder(id))!.status, 'cancelled');
  assert.equal(await stock(2), before);
});

test('an order that is no longer pending: 409, and neither the order nor the stock changes', async () => {
  const order = await (await send(1, 2)).json();
  await changeStatus(order.id, 'paid');
  const before = await stock(1);
  assert.equal((await change(order.id, 5)).status, 409);
  // The route sees it before calling changeQuantity; changeQuantity looks again, with the order
  // locked, in case it gets paid right between the two.
  assert.deepEqual(await changeQuantity(order.id, 5), { error: 'status', status: 'paid' });
  assert.equal((await findOrder(order.id))!.quantity, 2);
  assert.equal(await stock(1), before);
});

test('paying and cancelling at the same time: a cancelled order does not go back to paid, and the stock comes back only once', async () => {
  const before = await stock(2);
  const ids: number[] = [];
  for (let time = 1; time <= 10; time++) ids.push((await (await send(2, 1)).json()).id);
  // If the payment arrives first, a paid order is cancelled; if it arrives later, it no longer pays it.
  const responses = await Promise.all(ids.flatMap((id) => [pay(id), cancel(id)]));
  for (const res of responses) assert.equal(res.status, 200);
  for (const id of ids) assert.equal((await findOrder(id))!.status, 'cancelled');
  // Cancelling again gives nothing else back.
  for (const id of ids) assert.equal((await cancel(id)).status, 200);
  assert.equal(await stock(2), before);
});

test('paying and changing the quantity at the same time: the order ends paid with the final quantity, and the stock adds up', async () => {
  const before = await stock(2);
  const ids: number[] = [];
  for (let time = 1; time <= 10; time++) ids.push((await (await send(2, 1)).json()).id);
  // If the change arrives first, the order of 3 is paid; if it arrives later, 409, and the one of 1 is paid.
  await Promise.all(ids.flatMap((id) => [pay(id), change(id, 3)]));
  let ordered = 0;
  for (const id of ids) {
    const order = (await findOrder(id))!;
    assert.equal(order.status, 'paid');
    ordered += order.quantity;
  }
  assert.equal(await stock(2), before - ordered);
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
