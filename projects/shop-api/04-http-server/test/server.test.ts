import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createShopServer } from '../src/app.ts';

// The real server, on a free port the system picks (port 0).
const server = createShopServer();
let base = '';
before(async () => {
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const request = (path: string, init?: RequestInit) => fetch(base + path, init);
const send = (body: string) =>
  request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

test('GET / answers with text', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.match(await res.text(), /Ana and Luis's shop/);
});

test('GET /products returns all three in JSON', async () => {
  const res = await request('/products');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal((await res.json()).length, 3);
});

test('GET /products/2 returns the mug; /products/99, a 404', async () => {
  assert.deepEqual(await (await request('/products/2')).json(), {
    id: 2,
    name: 'Mug',
    price: 8.5,
  });
  const res = await request('/products/99');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No such product' });
});

test('POST /orders creates an order: 201 with Location', async () => {
  const res = await send('{"productId":1,"quantity":2}');
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.deepEqual(order, { id: order.id, productId: 1, quantity: 2, status: 'pending' });
  assert.equal(res.headers.get('location'), `/orders/${order.id}`);
  const list = await (await request('/orders')).json();
  assert.ok(list.some((o: { id: number }) => o.id === order.id));
});

test('the Location address exists; an order that does not exist, 404', async () => {
  const order = await (await send('{"productId":3,"quantity":1}')).json();
  assert.deepEqual(await (await request(`/orders/${order.id}`)).json(), order);
  const res = await request('/orders/99');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No such order' });
});

test('POST /orders with a body that is not JSON: 400', async () => {
  const res = await send('this is not JSON');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'The body is not valid JSON' });
});

test('POST /orders with a product that does not exist: 422', async () => {
  assert.equal((await send('{"productId":99,"quantity":1}')).status, 422);
});

test('a method the route does not accept: 405 with Allow', async () => {
  const res = await request('/products', { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  assert.equal((await request('/orders', { method: 'PUT' })).headers.get('allow'), 'GET, POST');
});

test('a route that does not exist: 404', async () => {
  assert.equal((await request('/offers')).status, 404);
});
