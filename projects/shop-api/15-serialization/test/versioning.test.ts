import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';

const admin = { Authorization: `Bearer ${config.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };

test('the root says which versions there are and when version 1 is retired', async () => {
  assert.deepEqual(await (await app.request('/')).json(), {
    name: "API for Ana and Luis's shop",
    versions: [
      { version: 'v2', url: '/v2', status: 'current' },
      { version: 'v1', url: '/v1', status: 'deprecated', sunset: '2027-04-13T00:00:00.000Z' },
    ],
  });
});

test('v2: the price, in whole cents', async () => {
  assert.deepEqual(await (await app.request('/v2/products/2')).json(), {
    id: 2,
    name: 'Mug',
    priceCents: 850,
  });
});

test('v1 stays as it was: the price, in euros', async () => {
  assert.deepEqual(await (await app.request('/v1/products/2')).json(), {
    id: 2,
    name: 'Mug',
    price: 8.5,
  });
  const cheap = await (await app.request('/v1/products?max=10&sort=-price')).json();
  assert.deepEqual(cheap, [{ id: 2, name: 'Mug', price: 8.5 }]);
});

test('v1 warns that it is deprecated, when it is retired and where version 2 is', async () => {
  const res = await app.request('/v1/products/2');
  assert.equal(res.headers.get('deprecation'), '@1791849600');
  assert.equal(res.headers.get('sunset'), 'Tue, 13 Apr 2027 00:00:00 GMT');
  assert.equal(res.headers.get('link'), '</v2/products/2>; rel="successor-version"');
});

test('v2 does not carry those warnings', async () => {
  const res = await app.request('/v2/products/2');
  assert.equal(res.headers.get('deprecation'), null);
  assert.equal(res.headers.get('sunset'), null);
});

test('a product created with v1, in euros, reads in v2 in cents', async () => {
  const res = await app.request('/v1/products', {
    method: 'POST',
    headers: admin,
    body: '{"name":"Cap","price":8.29}',
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.price, 8.29);
  assert.equal(res.headers.get('location'), `/v1/products/${created.id}`);
  const inV2 = await (await app.request(`/v2/products/${created.id}`)).json();
  assert.equal(inV2.priceCents, 829);
});

test('in v2, the price in euros is no longer valid: it is a breaking change', async () => {
  const res = await app.request('/v2/products', {
    method: 'POST',
    headers: admin,
    body: '{"name":"Cap","price":15}',
  });
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errors, [
    { field: 'priceCents', problem: 'Must be a number' },
  ]);
});

test("v1's orders are v2's, with the warnings and without losing the next page's Link", async () => {
  const res = await app.request('/v1/orders?limit=2');
  assert.equal(res.status, 200);
  assert.deepEqual(
    (await res.json()).map((order: { id: number }) => order.id),
    [25, 24],
  );
  assert.equal(res.headers.get('deprecation'), '@1791849600');
  const link = res.headers.get('link') ?? '';
  assert.match(link, /<http:\/\/localhost\/v1\/orders\?limit=2&cursor=MjQ>; rel="next"/);
  assert.match(link, /<\/v2\/orders>; rel="successor-version"/);
});

test('without a version, the routes no longer exist: 404', async () => {
  assert.equal((await app.request('/products')).status, 404);
});
