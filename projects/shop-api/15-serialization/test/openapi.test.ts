import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';

const document = async () => (await app.request('/v2/openapi.json')).json();

test('GET /v2/openapi.json: the contract, in OpenAPI 3.1, with the routes under /v2', async () => {
  const res = await app.request('/v2/openapi.json');
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.openapi, '3.1.0');
  assert.equal(doc.info.title, "API for Ana and Luis's shop");
  assert.deepEqual(doc.servers, [{ url: '/v2' }]);
});

test("all of v2's routes are there, each with its methods", async () => {
  const { paths } = await document();
  const methods = Object.fromEntries(
    Object.entries(paths).map(([path, operations]) => [path, Object.keys(operations as object)]),
  );
  assert.deepEqual(methods, {
    '/products': ['get', 'post'],
    '/products/{id}': ['get', 'delete'],
    '/orders': ['get', 'post'],
    '/orders/{id}': ['get', 'patch'],
    '/orders/{id}/cancellation': ['post'],
  });
});

test('the named schemas, and the token as the way to authenticate', async () => {
  const { components } = await document();
  assert.deepEqual(Object.keys(components.schemas).sort(), [
    'NewOrder',
    'NewProduct',
    'Order',
    'OrderChange',
    'Problem',
    'Product',
  ]);
  assert.deepEqual(components.securitySchemes.Bearer, { type: 'http', scheme: 'bearer' });
});

test('the validation rules show up in the documentation: they are the same schemas', async () => {
  const { components } = await document();
  const quantity = components.schemas.NewOrder.properties.quantity;
  assert.equal(quantity.type, 'integer');
  assert.equal(quantity.minimum, 1);
  assert.equal(quantity.maximum, 10);
  assert.deepEqual(components.schemas.NewOrder.required, ['productId', 'quantity']);
});

test('each route says what it answers, its errors too, as Problem Details', async () => {
  const { paths } = await document();
  const create = paths['/products'].post;
  assert.deepEqual(create.security, [{ Bearer: [] }]);
  assert.deepEqual(Object.keys(create.responses), ['201', '401', '422']);
  assert.ok(create.responses['201'].headers.Location);
  assert.deepEqual(create.responses['422'].content['application/problem+json'].schema, {
    $ref: '#/components/schemas/Problem',
  });
  const cancel = paths['/orders/{id}/cancellation'].post;
  assert.deepEqual(Object.keys(cancel.responses), ['200', '404', '409', '422']);
});

test("the path's id: a required integer", async () => {
  const { paths } = await document();
  const [id] = paths['/orders/{id}'].get.parameters;
  assert.equal(id.name, 'id');
  assert.equal(id.in, 'path');
  assert.equal(id.required, true);
  assert.equal(id.schema.type, 'integer');
});

test('GET /docs: the page that shows the contract, with Scalar at a fixed version', async () => {
  const res = await app.request('/docs');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  const html = await res.text();
  assert.match(html, /\/v2\/openapi\.json/);
  assert.match(html, /@scalar\/api-reference@\d+\.\d+\.\d+/);
});

test("the contract's validation answers the same 422 as always", async () => {
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"productId":1,"quantity":11}',
  });
  assert.equal(res.status, 422);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual((await res.json()).errors, [
    { field: 'quantity', problem: 'At most 10 per order' },
  ]);
});

test('a body that does not say it is JSON: 415', async () => {
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{"productId":1,"quantity":1}',
  });
  assert.equal(res.status, 415);
  assert.equal((await res.json()).title, 'Unsupported Media Type');
});

test('v1 is not in the contract: /v1/openapi.json does not exist', async () => {
  assert.equal((await app.request('/v1/openapi.json')).status, 404);
});
