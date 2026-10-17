// Adds 100,000 fake orders, to see with EXPLAIN ANALYZE what an index changes (lesson 7). Run it
// with: npm run db:many-orders
// They're all older than the sample ones. To remove them afterwards:
//   DELETE FROM orders WHERE created_at < '2026-10-01 09:00:00+00';
import { pool } from '../src/db.ts';

// #region generate
// generate_series(1, 100000) gives the numbers from 1 to 100,000, one per row, and the INSERT
// creates an order with each one: it all happens inside the database, in a single query. One per
// minute, going back from the first sample order.
await pool.query(`
  INSERT INTO orders (product_id, quantity, status, created_at)
  SELECT
    n % 3 + 1,
    n % 4 + 1,
    'shipped',
    timestamptz '2026-10-01 09:00:00+00' - n * interval '1 minute'
  FROM generate_series(1, 100000) AS n
`);
// ANALYZE updates the table's statistics (how many rows it has, what its values are like):
// PostgreSQL uses them to decide how to run each query.
await pool.query('ANALYZE orders');
// #endregion generate

const { rows } = await pool.query('SELECT count(*)::int AS orders FROM orders');
console.log(`There are now ${rows[0].orders} orders`);
await pool.end();
