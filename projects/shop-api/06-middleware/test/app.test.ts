import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { ADMIN_TOKEN } from '../src/config.ts';

// The request log writes with console.log: here it's collected instead of written.
const lines = mock.method(console, 'log', () => {});
beforeEach(() => lines.mock.resetCalls());

const json = { 'Content-Type': 'application/json' };

test('the request log records method, path, status code and time', async () => {
  await app.request('/products/99');
  assert.match(String(lines.mock.calls[0]?.arguments[0]), /^GET \/products\/99 404 \d+ ms$/);
});

test('CORS: the response lets https://shop.example read it', async () => {
  const res = await app.request('/products', { headers: { Origin: 'https://shop.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://shop.example');
});

test('CORS: answers the preflight with 204 and the allowed methods', async () => {
  const res = await app.request('/orders', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://shop.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
});

test('POST /products without the token: 401 with WWW-Authenticate', async () => {
  const res = await app.request('/products', {
    method: 'POST',
    headers: json,
    body: '{"name":"Cap","price":15}',
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
});

test('POST /products with the token: 201, and the product shows up in the list', async () => {
  const res = await app.request('/products', {
    method: 'POST',
    headers: { ...json, Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: '{"name":"Cap","price":15}',
  });
  assert.equal(res.status, 201);
  const product = await res.json();
  assert.equal(res.headers.get('location'), `/products/${product.id}`);
  assert.equal((await (await app.request(`/products/${product.id}`)).json()).name, 'Cap');
});

test('the routes from lesson 5 stay the same', async () => {
  assert.equal((await (await app.request('/products?max=10')).json()).length, 1);
  const res = await app.request('/orders', {
    method: 'POST',
    headers: json,
    body: '{"productId":1,"quantity":2}',
  });
  assert.equal(res.status, 201);
  assert.equal(
    (await app.request('/products', { method: 'DELETE' })).headers.get('allow'),
    'GET, POST',
  );
});
