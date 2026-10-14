// Creates the shop's tables and fills them with the sample data. First it drops the ones that were
// there, with everything in them: it's useful while the tables are being designed, when there's no
// data to keep yet. In lesson 6, migrations replace it. Run it with: npm run db:create
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

// The database's address, from .env: postgres://user:password@server:port/database
const url = process.env.DATABASE_URL;
if (url === undefined) {
  console.error('DATABASE_URL is missing: copy .env.example as .env and put in your database');
  process.exit(1);
}

const read = (file: string) => readFile(join(import.meta.dirname, '..', 'db', file), 'utf8');

// #region create
const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query(`
    DROP TABLE IF EXISTS
      orders, product_categories, categories, products, idempotency_keys, processed_events
  `);
  await client.query(await read('schema.sql'));
  await client.query(await read('seed.sql'));
  // count(*) is a bigint, and pg returns it as text: ::int turns it into a normal number.
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM products) AS products,
      (SELECT count(*)::int FROM categories) AS categories,
      (SELECT count(*)::int FROM orders) AS orders
  `);
  const { products, categories, orders } = rows[0];
  console.log(
    `Tables created: ${products} products, ${categories} categories and ${orders} orders`,
  );
} finally {
  // The connection is closed whatever happens: otherwise the program would keep waiting.
  await client.end();
}
// #endregion create
