import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { changeStatus, findOrder } from '../src/data.ts';
import { useDb } from './db.ts';
import { ANA, CARMEN, asUser } from './identities.ts';

// Ana is admin (she manages products); Carmen, a customer (she places orders). Unless something
// else is said, the requests go with Carmen's session.
let admin: Record<string, string>;
let carmen: Record<string, string>;
useDb(async () => {
  admin = await asUser(ANA);
  carmen = await asUser(CARMEN);
});

const send = (method: string, path: string, body?: unknown, headers = carmen) =>
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
  const list = await (await app.request('/v2/orders', { headers: carmen })).json();
  assert.ok(list.some((other: { id: number }) => other.id === order.id));
});

test('DELETE /products/:id without a session: 401', async () => {
  assert.equal((await send('DELETE', '/v2/products/1', undefined, {})).status, 401);
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

// #region change-product
test('PATCH /products/:id: changes the name, the price or both, and returns the product', async () => {
  const price = await send('PATCH', '/v2/products/2', { priceCents: 900 }, admin);
  assert.equal(price.status, 200);
  assert.deepEqual(await price.json(), {
    id: 2,
    name: 'Mug',
    priceCents: 900,
    stock: 60,
    categories: ['Home', 'Gifts'],
  });
  const both = await send('PATCH', '/v2/products/2', { name: ' Big mug ', priceCents: 950 }, admin);
  assert.equal(both.status, 200);
  assert.deepEqual(await (await app.request('/v2/products/2')).json(), {
    id: 2,
    name: 'Big mug',
    priceCents: 950,
    stock: 60,
    categories: ['Home', 'Gifts'],
  });
});

test('PATCH /products/:id: 404 if it does not exist, 403 without permission, 422 with no change or with an invalid one', async () => {
  assert.equal((await send('PATCH', '/v2/products/999', { priceCents: 900 }, admin)).status, 404);
  // Carmen is a customer: she doesn't manage products.
  assert.equal((await send('PATCH', '/v2/products/1', { priceCents: 1 })).status, 403);
  assert.equal((await send('PATCH', '/v2/products/1', { priceCents: 1 }, {})).status, 401);
  const empty = await send('PATCH', '/v2/products/1', {}, admin);
  assert.equal(empty.status, 422);
  assert.deepEqual((await empty.json()).errors, [
    { field: '', problem: 'Change at least the name or the price' },
  ]);
  const free = await send('PATCH', '/v2/products/1', { priceCents: 0 }, admin);
  assert.equal(free.status, 422);
  assert.deepEqual((await free.json()).errors, [
    { field: 'priceCents', problem: 'Must be greater than 0' },
  ]);
  // Nothing has changed.
  assert.equal((await (await app.request('/v2/products/1')).json()).priceCents, 2000);
});
// #endregion change-product

test('after a delete, a new product does not repeat the id of another one', async () => {
  // The cap (4): a product without orders, which can be deleted.
  assert.equal((await send('DELETE', '/v2/products/4', undefined, admin)).status, 204);
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
  const { createdAt, ...order } = await res.json();
  assert.deepEqual(order, {
    id,
    productId: 1,
    quantity: 5,
    status: 'pending',
    customerId: 3,
  });
  assert.equal(typeof createdAt, 'string');
});

test('PATCH with an invalid quantity: 422; to an order that does not exist: 404', async () => {
  const id = await newOrder();
  assert.equal((await send('PATCH', `/v2/orders/${id}`, { quantity: 0 })).status, 422);
  assert.equal((await send('PATCH', '/v2/orders/999', { quantity: 1 })).status, 404);
});

test('PATCH to an order already paid: 409, and the order does not change', async () => {
  const id = await newOrder();
  await changeStatus(id, 'paid');
  const res = await send('PATCH', `/v2/orders/${id}`, { quantity: 5 });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).detail, 'The order is paid: it can no longer be changed');
  assert.equal((await findOrder(id))!.quantity, 2);
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
  await changeStatus(id, 'shipped');
  const res = await send('POST', `/v2/orders/${id}/cancellation`);
  assert.equal(res.status, 409);
  assert.equal((await findOrder(id))!.status, 'shipped');
  assert.equal((await send('POST', '/v2/orders/999/cancellation')).status, 404);
});

test('a method the route does not have: 405, with the ones it has in Allow', async () => {
  const cases = [
    ['PUT', '/v2/products/1', 'GET, DELETE, PATCH'],
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
