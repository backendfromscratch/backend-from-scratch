import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { queryByCursor, type Cursor } from '../src/pagination.ts';
import { run, useDb } from './db.ts';
import { ANA, CARMEN, asUser } from './identities.ts';

// Ana, admin, sees all the orders; Carmen, a customer, places them.
let ana: Record<string, string>;
let carmen: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
  carmen = await asUser(CARMEN);
});

/** Asks for a page and returns its orders' ids and the URL of the next one. */
async function page(url: string): Promise<{ ids: number[]; next?: string }> {
  const res = await app.request(url, { headers: ana });
  assert.equal(res.status, 200, url);
  const next = res.headers.get('link')?.match(/^<(.+)>; rel="next"$/)?.[1];
  return { ids: (await res.json()).map((order: { id: number }) => order.id), next };
}

/** PostgreSQL's plan for the query of a page of 11 orders, as text. */
async function plan(after?: Cursor): Promise<string> {
  // toSQL() gives the SQL Drizzle writes for that query, and its parameters.
  const { sql, params } = queryByCursor(11, after).toSQL();
  const { rows } = await pool.query(`EXPLAIN ${sql}`, params);
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

const fromTheMiddle = { createdAt: '2026-09-01T00:00:00.000Z', id: 0 };

test('migration 003 creates the index for the orders list: by date and by id, highest first', async () => {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'orders_by_date'`,
  );
  assert.match(rows[0].indexdef, /ON public\.orders USING btree \(created_at DESC, id DESC\)$/);
});

test('by cursor every order is seen exactly once, even if new ones arrive between two pages', async () => {
  const seen: number[] = [];
  let url: string | undefined = '/v2/orders?limit=4';
  while (url) {
    const { ids, next } = await page(url);
    seen.push(...ids);
    url = next;
    // Between one page and the next, someone places an order: it's newer, it goes at the very front.
    await app.request('/v2/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...carmen },
      body: '{"productId":1,"quantity":1}',
    });
  }
  assert.deepEqual(
    seen,
    Array.from({ length: 25 }, (_, i) => 25 - i),
  );
});

test('an old cursor, which only carried the id, is no longer valid: 422', async () => {
  const res = await app.request('/v2/orders?cursor=MTY', { headers: ana });
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errors, [
    { field: 'cursor', problem: 'The cursor is not valid' },
  ]);
});

test('with 100,000 orders, the list uses the index; without it, it reads the whole table', async () => {
  const { stdout } = await run('node', ['scripts/many-orders.ts']);
  assert.match(stdout, /^There are now 1000\d\d orders$/m);

  // The first page and one in the middle: both go through the index, straight to their place.
  const first = await plan();
  assert.match(first, /Index Scan using orders_by_date on orders/);
  const middle = await plan(fromTheMiddle);
  assert.match(middle, /Index Scan using orders_by_date on orders/);
  assert.match(middle, /Index Cond: \(ROW\(created_at, id\) < ROW\(/);

  // Without the index, PostgreSQL has to read every order and sort them to keep 11.
  await pool.query('DROP INDEX orders_by_date');
  const withoutIndex = await plan(fromTheMiddle);
  assert.doesNotMatch(withoutIndex, /Index Scan/);
  assert.match(withoutIndex, /Seq Scan on orders/);
});
