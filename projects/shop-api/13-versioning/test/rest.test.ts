import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { findOrder } from '../src/data.ts';

const admin = { Authorization: `Bearer ${config.ADMIN_TOKEN}` };

const send = (method: string, path: string, body?: unknown, headers = {}) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Creates an order and returns its id. */
async function newOrder(): Promise<number> {
  const res = await send('POST', '/v2/orders', { productId: 1, quantity: 2 });
  return (await res.json()).id;
}

test('creating an order: 201, with its URL in Location, and it shows up in the list', async () => {
  const res = await send('POST', '/v2/orders', { productId: 1, quantity: 2 });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(res.headers.get('location'), `/v2/orders/${order.id}`);
  assert.equal(order.status, 'pending');
  const list = await (await app.request('/v2/orders')).json();
  assert.ok(list.some((other: { id: number }) => other.id === order.id));
});

test('DELETE /products/:id without a token: 401', async () => {
  assert.equal((await send('DELETE', '/v2/products/1')).status, 401);
});

test('DELETE /products/:id: 204 without a body; afterwards, 404', async () => {
  const created = await (
    await send('POST', '/v2/products', { name: 'Cap', priceCents: 1500 }, admin)
  ).json();
  const res = await send('DELETE', `/v2/products/${created.id}`, undefined, admin);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
  assert.equal((await app.request(`/v2/products/${created.id}`)).status, 404);
  assert.equal((await send('DELETE', `/v2/products/${created.id}`, undefined, admin)).status, 404);
});

test('after a delete, a new product does not repeat the id of another one', async () => {
  await send('DELETE', '/v2/products/2', undefined, admin);
  const added = await (
    await send('POST', '/v2/products', { name: 'Beanie', priceCents: 1200 }, admin)
  ).json();
  const list = await (await app.request('/v2/products')).json();
  const ids = list.map((product: { id: number }) => product.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.slice(0, -1).includes(added.id));
});

test('PATCH /orders/:id changes the quantity and returns the whole order', async () => {
  const id = await newOrder();
  const res = await send('PATCH', `/v2/orders/${id}`, { quantity: 5 });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id, productId: 1, quantity: 5, status: 'pending' });
});

test('PATCH with an invalid quantity: 422; to an order that does not exist: 404', async () => {
  const id = await newOrder();
  assert.equal((await send('PATCH', `/v2/orders/${id}`, { quantity: 0 })).status, 422);
  assert.equal((await send('PATCH', '/v2/orders/999', { quantity: 1 })).status, 404);
});

test('PATCH to an order already paid: 409, and the order does not change', async () => {
  const id = await newOrder();
  findOrder(id)!.status = 'paid';
  const res = await send('PATCH', `/v2/orders/${id}`, { quantity: 5 });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).detail, 'The order is paid: it can no longer be changed');
  assert.equal(findOrder(id)!.quantity, 2);
});

test('POST /orders/:id/cancellation: the order is cancelled, even if repeated', async () => {
  const id = await newOrder();
  for (let time = 1; time <= 2; time++) {
    const res = await send('POST', `/v2/orders/${id}/cancellation`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'cancelled');
  }
  assert.equal((await send('PATCH', `/v2/orders/${id}`, { quantity: 3 })).status, 409);
});

test('cancelling a shipped order: 409; one that does not exist: 404', async () => {
  const id = await newOrder();
  findOrder(id)!.status = 'shipped';
  const res = await send('POST', `/v2/orders/${id}/cancellation`);
  assert.equal(res.status, 409);
  assert.equal(findOrder(id)!.status, 'shipped');
  assert.equal((await send('POST', '/v2/orders/999/cancellation')).status, 404);
});

test('a method the route does not have: 405, with the ones it has in Allow', async () => {
  const cases = [
    ['PUT', '/v2/products/1', 'GET, DELETE'],
    ['DELETE', '/v2/orders', 'GET, POST'],
    ['DELETE', '/v2/orders/1', 'GET, PATCH'],
    ['GET', '/v2/orders/1/cancellation', 'POST'],
  ];
  for (const [method, path, allowed] of cases) {
    const res = await send(method!, path!);
    assert.equal(res.status, 405, `${method} ${path}`);
    assert.equal(res.headers.get('allow'), allowed);
  }
});
