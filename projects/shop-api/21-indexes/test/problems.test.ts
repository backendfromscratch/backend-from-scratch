import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { changeStatus } from '../src/data.ts';
import { useDb } from './db.ts';

useDb();

const send = (method: string, path: string, body: string) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  });

/** Checks that the response is a Problem Details and returns its body. */
async function readProblem(res: Response, status: number) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  const body = await res.json();
  assert.equal(body.status, status, 'the body repeats the status code');
  assert.equal(typeof body.type, 'string');
  assert.equal(typeof body.title, 'string');
  return body;
}

test("a route that does not exist: 404, about:blank, with the code's phrase as title", async () => {
  assert.deepEqual(await readProblem(await app.request('/offers'), 404), {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'No such route',
  });
});

test('a product or an order that does not exist: 404 with its detail', async () => {
  const product = await readProblem(await app.request('/v2/products/99'), 404);
  assert.equal(product.detail, 'No such product');
  const order = await readProblem(await app.request('/v2/orders/99'), 404);
  assert.equal(order.detail, 'No such order');
});

test('invalid data: 422, with one error per field in "errors"', async () => {
  const res = await send('POST', '/v2/orders', '{"productId":"one","quantity":0}');
  assert.deepEqual(await readProblem(res, 422), {
    type: 'https://shop.example/problems/invalid-data',
    title: 'The data is not valid',
    status: 422,
    detail: 'See "errors" for what is wrong with each field.',
    errors: [
      { field: 'productId', problem: 'Must be a number' },
      { field: 'quantity', problem: 'At least 1' },
    ],
  });
});

test('a product that does not exist in an order: the same type of problem, with the field', async () => {
  const body = await readProblem(
    await send('POST', '/v2/orders', '{"productId":99,"quantity":1}'),
    422,
  );
  assert.equal(body.type, 'https://shop.example/problems/invalid-data');
  assert.deepEqual(body.errors, [{ field: 'productId', problem: 'No such product' }]);
});

test('the path and the query string also answer 422 with "errors"', async () => {
  const id = await readProblem(await app.request('/v2/products/abc'), 422);
  assert.deepEqual(id.errors, [{ field: 'id', problem: 'Must be a number' }]);
  const max = await readProblem(await app.request('/v2/products?maxCents=-5'), 422);
  assert.deepEqual(max.errors, [{ field: 'maxCents', problem: 'Must be greater than 0' }]);
});

test('a body that is not JSON: 400, as a problem too', async () => {
  const body = await readProblem(await send('POST', '/v2/orders', 'this is not JSON'), 400);
  assert.equal(body.title, 'Bad Request');
  assert.equal(body.detail, 'The request cannot be read');
});

test('without a token: 401, with WWW-Authenticate', async () => {
  const res = await send('POST', '/v2/products', '{"name":"Cap","priceCents":1500}');
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
  assert.equal((await readProblem(res, 401)).title, 'Unauthorized');
});

test('a method that does not exist: 405 as a problem, with Allow', async () => {
  const res = await app.request('/v2/orders/1', { method: 'PUT' });
  assert.equal(res.headers.get('allow'), 'GET, PATCH');
  const body = await readProblem(res, 405);
  assert.equal(body.title, 'Method Not Allowed');
  assert.equal(body.detail, 'This route does not accept PUT');
});

test("an order that can no longer be changed: 409, with the shop's own type", async () => {
  const { id } = await (await send('POST', '/v2/orders', '{"productId":1,"quantity":1}')).json();
  await changeStatus(id, 'shipped');
  assert.deepEqual(
    await readProblem(await app.request(`/v2/orders/${id}/cancellation`, { method: 'POST' }), 409),
    {
      type: 'https://shop.example/problems/order-status',
      title: "The order's status doesn't allow it",
      status: 409,
      detail: 'The order is already shipped: it cannot be cancelled',
    },
  );
});
