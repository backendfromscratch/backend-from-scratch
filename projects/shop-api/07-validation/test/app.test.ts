import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { ADMIN_TOKEN } from '../src/config.ts';

mock.method(console, 'log', () => {});

const send = (path: string, body: string, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

test('a correct order: 201', async () => {
  assert.equal((await send('/orders', '{"productId":1,"quantity":2}')).status, 201);
});

test('an order with no quantity and a text id: 422 with each problem', async () => {
  const res = await send('/orders', '{"productId":"one"}');
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), {
    error: 'The data is not valid',
    details: [
      { field: 'productId', problem: 'Must be a number' },
      { field: 'quantity', problem: 'Must be a number' },
    ],
  });
});

test('a negative quantity, or one that is too large: 422', async () => {
  const negative = await (await send('/orders', '{"productId":1,"quantity":-2}')).json();
  assert.deepEqual(negative.details, [{ field: 'quantity', problem: 'At least 1' }]);
  const large = await (await send('/orders', '{"productId":1,"quantity":50}')).json();
  assert.deepEqual(large.details, [{ field: 'quantity', problem: 'At most 10 per order' }]);
});

test('a product that does not exist passes the schema, but not the route check: 422', async () => {
  const res = await send('/orders', '{"productId":99,"quantity":1}');
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: 'No such product' });
});

test('a body that is not JSON cannot be read: 400', async () => {
  assert.equal((await send('/orders', 'this is not JSON')).status, 400);
});

test('the id in the path and the query string are validated too', async () => {
  const id = await app.request('/products/abc');
  assert.equal(id.status, 422);
  assert.deepEqual((await id.json()).details, [{ field: 'id', problem: 'Must be a number' }]);
  assert.equal((await app.request('/products?max=-5')).status, 422);
  assert.equal((await (await app.request('/products?max=10')).json()).length, 1);
});

test('a new product: the name is trimmed and cannot be left empty', async () => {
  const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const empty = await send('/products', '{"name":"   ","price":15}', admin);
  assert.deepEqual((await empty.json()).details, [{ field: 'name', problem: "Can't be empty" }]);
  const trimmed = await send('/products', '{"name":"  Cap ","price":15}', admin);
  assert.equal((await trimmed.json()).name, 'Cap');
});

test('without the token, the 401 comes before the validation', async () => {
  assert.equal((await send('/products', '{}')).status, 401);
});
