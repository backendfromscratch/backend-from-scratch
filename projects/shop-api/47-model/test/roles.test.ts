import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { useDb } from './db.ts';
import { ANA, CARMEN, asDelivery, asUser, PABLO } from './identities.ts';

// Each of the shop's identities: nobody, Ana (admin), Carmen and Pablo (customers) and the
// delivery company's key.
const identities: Record<string, Record<string, string>> = { nobody: {} };
useDb(async () => {
  identities.ana = await asUser(ANA);
  identities.carmen = await asUser(CARMEN);
  identities.pablo = await asUser(PABLO);
  identities.delivery = await asDelivery();
});

const send = (who: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...identities[who] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** The status code of the same request, made by each of those identities. */
async function codes(whos: string[], method: string, path: string, body?: unknown) {
  const result: Record<string, number> = {};
  for (const who of whos) result[who] = (await send(who, method, path, body)).status;
  return result;
}

const ids = async (res: Response) => (await res.json()).map((o: { id: number }) => o.id);

test('the list of orders: without an identity, 401; a customer sees their own; admin and delivery, all', async () => {
  const withNobody = await send('nobody', 'GET', '/v2/orders?limit=50');
  assert.equal(withNobody.status, 401);
  assert.equal(withNobody.headers.get('www-authenticate'), 'Bearer realm="shop-api"');

  const carmens = await (await send('carmen', 'GET', '/v2/orders?limit=50')).json();
  assert.equal(carmens.length, 13);
  assert.ok(carmens.every((order: { customerId: number }) => order.customerId === CARMEN));
  assert.deepEqual(await ids(await send('pablo', 'GET', '/v2/orders?limit=3')), [24, 22, 20]);
  for (const who of ['ana', 'delivery']) {
    assert.equal((await ids(await send(who, 'GET', '/v2/orders?limit=50'))).length, 25);
  }
});

test("someone else's order: 404, as if it did not exist, its event stream too", async () => {
  // Order 2 is Pablo's.
  assert.deepEqual(
    await codes(['nobody', 'carmen', 'pablo', 'ana', 'delivery'], 'GET', '/v2/orders/2'),
    {
      nobody: 401,
      carmen: 404,
      pablo: 200,
      ana: 200,
      delivery: 200,
    },
  );
  const notTheirs = await send('carmen', 'GET', '/v2/orders/2');
  assert.equal((await notTheirs.json()).detail, 'No such order');
  assert.equal((await send('carmen', 'GET', '/v2/orders/2/events')).status, 404);
});

test("changing or cancelling someone else's order: 404; their own, yes; admin, any", async () => {
  // Order 22 (pending) is Pablo's; 21 (pending), Carmen's.
  assert.equal((await send('carmen', 'PATCH', '/v2/orders/22', { quantity: 1 })).status, 404);
  assert.equal((await send('carmen', 'POST', '/v2/orders/22/cancellation')).status, 404);
  assert.equal((await send('delivery', 'POST', '/v2/orders/22/cancellation')).status, 403);
  assert.equal((await send('pablo', 'PATCH', '/v2/orders/22', { quantity: 1 })).status, 200);
  assert.equal((await send('ana', 'POST', '/v2/orders/21/cancellation')).status, 200);
  const { rows } = await pool.query(
    'SELECT id, quantity, status FROM orders WHERE id IN (21, 22) ORDER BY id',
  );
  assert.deepEqual(rows, [
    { id: 21, quantity: 2, status: 'cancelled' },
    { id: 22, quantity: 1, status: 'pending' },
  ]);
});

test("placing an order needs a customer's session, and the order belongs to whoever places it", async () => {
  const created = { productId: 1, quantity: 1 };
  assert.deepEqual(await codes(['nobody', 'ana', 'delivery'], 'POST', '/v2/orders', created), {
    nobody: 401,
    ana: 403,
    delivery: 403,
  });
  const res = await send('carmen', 'POST', '/v2/orders', created);
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.customerId, CARMEN);
  assert.equal((await send('pablo', 'GET', `/v2/orders/${order.id}`)).status, 404);
});

test('the same Idempotency-Key from two customers: each one, their own order', async () => {
  const withKey = (who: string) =>
    app.request('/v2/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'the-same',
        ...identities[who],
      },
      body: '{"productId":2,"quantity":1}',
    });
  const carmens = await (await withKey('carmen')).json();
  const pablos = await withKey('pablo');
  assert.equal(pablos.headers.get('idempotent-replayed'), null);
  const his = await pablos.json();
  assert.notEqual(his.id, carmens.id);
  assert.equal(his.customerId, PABLO);
});

test('the delivery company marks a paid order as shipped, and nothing else', async () => {
  // Order 13 is paid.
  assert.deepEqual(await codes(['nobody', 'carmen'], 'POST', '/v2/orders/13/shipment'), {
    nobody: 401,
    carmen: 403,
  });
  const shipped = await send('delivery', 'POST', '/v2/orders/13/shipment');
  assert.equal(shipped.status, 200);
  assert.equal((await shipped.json()).status, 'shipped');
  // Already shipped, not again: 409. A pending one (25), neither.
  assert.equal((await send('delivery', 'POST', '/v2/orders/13/shipment')).status, 409);
  assert.equal((await send('delivery', 'POST', '/v2/orders/25/shipment')).status, 409);
  assert.equal((await send('delivery', 'POST', '/v2/orders/999/shipment')).status, 404);
});

test('admin manages the products: a customer or delivery, 403 without WWW-Authenticate', async () => {
  const product = { name: 'Pin', priceCents: 200 };
  assert.deepEqual(await codes(['nobody', 'carmen', 'delivery'], 'POST', '/v2/products', product), {
    nobody: 401,
    carmen: 403,
    delivery: 403,
  });
  const forbidden = await send('delivery', 'DELETE', '/v2/products/4');
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('www-authenticate'), null);
  assert.equal((await forbidden.json()).title, 'Forbidden');
  assert.equal((await send('ana', 'POST', '/v2/products', product)).status, 201);
  assert.equal((await send('nobody', 'GET', '/v2/products/4')).status, 200);
});

test('/v1 has the same protections', async () => {
  assert.equal((await send('nobody', 'GET', '/v1/orders')).status, 401);
  assert.equal((await send('carmen', 'GET', '/v1/orders/2')).status, 404);
  const product = { name: 'Pin', price: 2 };
  assert.deepEqual(await codes(['nobody', 'carmen', 'ana'], 'POST', '/v1/products', product), {
    nobody: 401,
    carmen: 403,
    ana: 201,
  });
});
