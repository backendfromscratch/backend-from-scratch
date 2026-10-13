import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { createCursor, readCursor } from '../src/pagination.ts';

interface Order {
  id: number;
  status: string;
}

/** Asks for a page and returns its orders and the URL of the next one (from the Link header). */
async function page(url: string): Promise<{ orders: Order[]; next?: string }> {
  const res = await app.request(url);
  assert.equal(res.status, 200, url);
  const link = res.headers.get('link');
  const next = link?.match(/^<(.+)>; rel="next"$/)?.[1];
  return { orders: await res.json(), next };
}

const ids = (orders: Order[]) => orders.map((order) => order.id);

test('with nothing: the 10 newest first, and a Link to the next page', async () => {
  const { orders, next } = await page('/orders');
  assert.deepEqual(ids(orders), [25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
  assert.equal(next, `http://localhost/orders?cursor=${createCursor(16)}`);
});

test('the cursor is opaque: the id in base64url, which the server knows how to read', () => {
  assert.equal(createCursor(16), 'MTY');
  assert.equal(readCursor('MTY'), 16);
});

test('following Link goes through the 25 orders, without repeating or skipping any', async () => {
  const seen: number[] = [];
  let url: string | undefined = '/orders?limit=10';
  let pages = 0;
  while (url) {
    const { orders, next } = await page(url);
    seen.push(...ids(orders));
    url = next;
    pages++;
  }
  assert.equal(pages, 3);
  assert.deepEqual(
    seen,
    Array.from({ length: 25 }, (_, i) => 25 - i),
  );
});

test('the status filter is kept in the link to the next page', async () => {
  const first = await page('/orders?status=shipped&limit=5');
  assert.ok(first.orders.every((order) => order.status === 'shipped'));
  assert.deepEqual(ids(first.orders), [12, 11, 10, 9, 8]);
  assert.match(first.next!, /status=shipped/);
  assert.match(first.next!, /limit=5/);
  const second = await page(first.next!);
  assert.deepEqual(ids(second.orders), [7, 6, 5, 4, 3]);
});

test('with offset, the link carries the next offset', async () => {
  const { orders, next } = await page('/orders?limit=5&offset=20');
  assert.deepEqual(ids(orders), [5, 4, 3, 2, 1]);
  assert.equal(next, undefined, 'the last page has no next one');
  const other = await page('/orders?limit=5&offset=5');
  assert.equal(other.next, 'http://localhost/orders?limit=5&offset=10');
});

test('what is not valid in the query string: 422, with each field', async () => {
  const cases = [
    ['/orders?limit=0', 'limit', 'At least 1'],
    ['/orders?limit=500', 'limit', 'At most 50'],
    ['/orders?cursor=this-is-not-a-cursor', 'cursor', 'The cursor is not valid'],
    ['/orders?status=lost', 'status', 'Must be pending, paid, shipped or cancelled'],
    ['/orders?cursor=MTY&offset=10', 'cursor', 'Use cursor or offset, not both'],
    ['/products?sort=name', 'sort', 'Must be price or -price'],
  ];
  for (const [url, field, problem] of cases) {
    const res = await app.request(url!);
    assert.equal(res.status, 422, url);
    assert.deepEqual((await res.json()).errors, [{ field, problem }], url);
  }
});

test('the products, sorted by price both ways and filtered', async () => {
  const prices = async (url: string) =>
    (await (await app.request(url)).json()).map((product: { price: number }) => product.price);
  assert.deepEqual(await prices('/products?sort=price'), [8.5, 20, 35]);
  assert.deepEqual(await prices('/products?sort=-price'), [35, 20, 8.5]);
  assert.deepEqual(await prices('/products?sort=-price&max=30'), [20, 8.5]);
});

// The last two tests create orders: they go at the end so they don't change what the ones above see.
const newOrder = () =>
  app.request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"productId":1,"quantity":1}',
  });

test('with offset, an order that arrives between two pages makes one show up twice', async () => {
  const first = await page('/orders?limit=5&offset=0');
  await newOrder();
  const second = await page(first.next!);
  assert.equal(second.orders[0]!.id, first.orders.at(-1)!.id, 'the last one repeats');
});

test('with a cursor, the order that arrives between two pages does not change the next one', async () => {
  const first = await page('/orders?limit=5');
  await newOrder();
  const second = await page(first.next!);
  assert.equal(second.orders[0]!.id, first.orders.at(-1)!.id - 1, 'it carries on right after');
});
