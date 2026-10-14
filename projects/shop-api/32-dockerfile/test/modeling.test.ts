import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../src/db.ts';
import { emptyDb, run } from './db.ts';

after(() => pool.end());

/** Checks that PostgreSQL rejects the query, with the code of the rule it breaks. */
const rejects = (sql: string, code: string) => assert.rejects(pool.query(sql), { code });

test('npm run db:migrate creates the tables, and npm run db:seed fills them with the sample data', async () => {
  await emptyDb();
  const migrate = await run('node', ['scripts/migrate.ts']);
  assert.match(migrate.stdout, /^Applied: 001-shop\.sql$/m);
  const seed = await run('node', ['scripts/seed.ts']);
  assert.match(seed.stdout, /^Practice accounts ready/m);
  assert.match(seed.stdout, /^Sample data loaded$/m);
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
  );
  assert.deepEqual(
    rows.map((row) => row.table_name),
    [
      'api_keys',
      'categories',
      'idempotency_keys',
      'migrations',
      'notifications',
      'orders',
      'processed_events',
      'product_categories',
      'products',
      'sessions',
      'users',
    ],
  );
});

test('PostgreSQL sets the ids, in order; the Cap has no orders', async () => {
  const { rows } = await pool.query(`
    SELECT p.id, p.name, count(o.id)::int AS orders
    FROM products p LEFT JOIN orders o ON o.product_id = p.id
    GROUP BY p.id ORDER BY p.id
  `);
  assert.deepEqual(rows, [
    { id: 1, name: 'T-shirt', orders: 8 },
    { id: 2, name: 'Mug', orders: 9 },
    { id: 3, name: 'Hoodie', orders: 8 },
    { id: 4, name: 'Cap', orders: 0 },
  ]);
});

// The codes are PostgreSQL's (SQLSTATE): 23514, a CHECK; 23503, a foreign key; 23505, a repeated
// value where it has to be unique; 23502, a NOT NULL.
test('CHECK: a price of 0 does not get in', async () => {
  await rejects(`INSERT INTO products (name, price_cents) VALUES ('Free', 0)`, '23514');
});

test('NOT NULL: a product without a price does not get in', async () => {
  await rejects(`INSERT INTO products (name) VALUES ('No price')`, '23502');
});

test('REFERENCES: an order for product 99, which does not exist, does not get in', async () => {
  await rejects(
    `INSERT INTO orders (product_id, quantity, status, created_at) VALUES (99, 1, 'pending', now())`,
    '23503',
  );
});

test('UNIQUE: two categories with the same name, no', async () => {
  await rejects(`INSERT INTO categories (name) VALUES ('Clothing')`, '23505');
});

test('CHECK: a status that is not one of the four (lost) does not get in', async () => {
  await rejects(
    `INSERT INTO orders (product_id, quantity, status, created_at) VALUES (1, 1, 'lost', now())`,
    '23514',
  );
});

test('PRIMARY KEY: the same pair of product and category, not twice', async () => {
  await rejects(`INSERT INTO product_categories (product_id, category_id) VALUES (1, 1)`, '23505');
});

test('a product with orders cannot be deleted: the orders need it', async () => {
  await rejects('DELETE FROM products WHERE id = 1', '23503');
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM products WHERE id = 1');
  assert.equal(rows[0].n, 1);
});

test('ON DELETE CASCADE: when a product without orders is deleted, its categories go with it', async () => {
  const capCategories = 'SELECT count(*)::int AS n FROM product_categories WHERE product_id = 4';
  assert.equal((await pool.query(capCategories)).rows[0].n, 2);
  await pool.query('DELETE FROM products WHERE id = 4');
  assert.equal((await pool.query(capCategories)).rows[0].n, 0);
  // The categories are still there: only the pairs are deleted.
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM categories')).rows[0].n, 3);
});
