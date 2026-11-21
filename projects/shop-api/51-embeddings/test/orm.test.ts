import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { run, useDb } from './db.ts';
import { ANA, asUser } from './identities.ts';

let admin: Record<string, string>;
useDb(async () => {
  admin = await asUser(ANA);
});

/** The products from an API URL, as "id: categories". */
async function categoriesOf(url: string): Promise<Record<number, string[]>> {
  const res = await app.request(url);
  assert.equal(res.status, 200, url);
  const list: { id: number; categories: string[] }[] = await res.json();
  return Object.fromEntries(list.map((product) => [product.id, product.categories]));
}

test('v2 shows the categories of each product, in the list and one by one', async () => {
  const all = await categoriesOf('/v2/products');
  // The usual four and, since Phase 11, the Scarf (5), one of the 16 new ones.
  assert.equal(Object.keys(all).length, 20);
  assert.deepEqual(
    { 1: all[1], 2: all[2], 3: all[3], 4: all[4], 5: all[5] },
    {
      1: ['Clothing'],
      2: ['Home', 'Gifts'],
      3: ['Clothing'],
      4: ['Clothing', 'Gifts'],
      5: ['Clothing', 'Gifts'],
    },
  );
  assert.deepEqual(await (await app.request('/v2/products/2')).json(), {
    id: 2,
    name: 'Mug',
    priceCents: 850,
    stock: 60,
    description: 'A 350 ml ceramic mug for the morning coffee or tea; it also makes a nice gift.',
    categories: ['Home', 'Gifts'],
  });
});

test('a new product starts without categories and without stock', async () => {
  const res = await app.request('/v2/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...admin },
    body: '{"name":"Pin","priceCents":200}',
  });
  assert.equal(res.status, 201);
  const { id, ...product } = await res.json();
  // With no description either (Phase 11): null.
  assert.deepEqual(product, {
    name: 'Pin',
    priceCents: 200,
    stock: 0,
    description: null,
    categories: [],
  });
  await app.request(`/v2/products/${id}`, {
    method: 'DELETE',
    headers: admin,
  });
});

test('?category= filters, whatever the capital letters, and combines with the other filters', async () => {
  const ids = async (url: string) => Object.keys(await categoriesOf(url)).map(Number);
  // With Phase 11's catalogue: the warm clothes and the summer ones are Clothing too.
  assert.deepEqual(await ids('/v2/products?category=clothing'), [1, 3, 4, 5, 6, 7, 13, 16, 17]);
  assert.deepEqual(await ids('/v2/products?category=GIFTS'), [2, 4, 5, 8, 9, 11, 14, 18, 19, 20]);
  assert.deepEqual(await ids('/v2/products?category=toys'), []);
  const cheap = await (
    await app.request('/v2/products?category=Clothing&maxCents=2000&sort=-price')
  ).json();
  assert.deepEqual(
    cheap.map((product: { name: string }) => product.name),
    ['T-shirt', 'Straw hat', 'Gloves', 'Wool hat', 'Cap', 'Flip-flops'],
  );
});

test('an odd value in ?category= is only a value: it does not change the query', async () => {
  assert.deepEqual(
    await categoriesOf(`/v2/products?category=${encodeURIComponent("x' OR '1'='1")}`),
    {},
  );
  const empty = await app.request('/v2/products?category=');
  assert.equal(empty.status, 422);
  assert.deepEqual((await empty.json()).errors, [{ field: 'category', problem: "Can't be empty" }]);
});

test('v1 does not change: no categories and no category filter', async () => {
  assert.deepEqual(await (await app.request('/v1/products/2')).json(), {
    id: 2,
    name: 'Mug',
    price: 8.5,
  });
  const all = await (await app.request('/v1/products?category=home')).json();
  assert.equal(all.length, 20);
});

test('the contract documents the categories and the filter', async () => {
  const doc = await (await app.request('/v2/openapi.json')).json();
  const product = doc.components.schemas.Product;
  assert.equal(product.properties.categories.type, 'array');
  assert.ok(product.required.includes('categories'));
  const filters = doc.paths['/products'].get.parameters.map((p: { name: string }) => p.name);
  assert.ok(filters.includes('category'));
});

test('examples/n-plus-one.ts: N+1 queries versus a single one, with the same result', async () => {
  const { stdout } = await run('node', ['examples/n-plus-one.ts']);
  const [nPlusOne, single] = stdout.split(/^== /m).slice(1);
  // One for the products and one more for each of the 20 (since Phase 11; before, 4).
  assert.match(nPlusOne!, /^Database queries: 21$/m);
  assert.match(single!, /^Database queries: 1$/m);
  const result = /^Result: (.*)$/m;
  assert.equal(nPlusOne!.match(result)![1], single!.match(result)![1]);
});

test('migration 004, which drizzle-kit generated, creates the index by category', async () => {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'product_categories_by_category'`,
  );
  assert.match(rows[0].indexdef, /ON public\.product_categories USING btree \(category_id\)$/);
});

test('drizzle-kit sees no pending changes: src/schema.ts and its migrations are up to date', async () => {
  const { stdout } = await run('npx', ['drizzle-kit', 'generate']);
  assert.match(stdout, /No schema changes, nothing to migrate/);
});
