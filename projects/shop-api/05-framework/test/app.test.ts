import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';

// app.request() hands a request to Hono without opening any port.
const send = (body: string) =>
  app.request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

test('GET / answers with text', async () => {
  const res = await app.request('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Ana and Luis's shop/);
});

test('GET /products returns all three; with ?max=25, two', async () => {
  assert.equal((await (await app.request('/products')).json()).length, 3);
  const cheap = await (await app.request('/products?max=25')).json();
  assert.deepEqual(
    cheap.map((p: { name: string }) => p.name),
    ['T-shirt', 'Mug'],
  );
});

test('GET /products/2 returns the mug; /products/99, a 404', async () => {
  assert.equal((await (await app.request('/products/2')).json()).name, 'Mug');
  assert.equal((await app.request('/products/99')).status, 404);
});

test('POST /orders creates an order: 201 with Location', async () => {
  const res = await send('{"productId":1,"quantity":2}');
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(res.headers.get('location'), `/orders/${order.id}`);
});

test('the Location address exists; an order that does not exist, 404', async () => {
  const order = await (await send('{"productId":3,"quantity":1}')).json();
  assert.deepEqual(await (await app.request(`/orders/${order.id}`)).json(), order);
  assert.equal((await app.request('/orders/99')).status, 404);
});

test('POST /orders with a body that is not JSON: 400', async () => {
  assert.equal((await send('this is not JSON')).status, 400);
});

test('POST /orders with a product that does not exist: 422', async () => {
  assert.equal((await send('{"productId":99,"quantity":1}')).status, 422);
});

test('a method the route does not accept: 405 with Allow', async () => {
  const res = await app.request('/products', { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  assert.equal((await app.request('/orders', { method: 'PUT' })).headers.get('allow'), 'GET, POST');
});

test('a route that does not exist: 404', async () => {
  assert.equal((await app.request('/offers')).status, 404);
});
