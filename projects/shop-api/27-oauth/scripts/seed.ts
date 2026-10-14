// Loads the practice data. Run it with: npm run db:seed
// - db/accounts.sql: the practice accounts (Phase 6). Always: the ones already there aren't
//   repeated. That way whoever carries on with the Phase 5 database, which already has data, gets
//   them too.
// - db/seed.sql: the sample products, categories and orders, only if there isn't any product yet:
//   in a database that already has them, it would repeat them.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';

const read = (file: string) => readFile(join(import.meta.dirname, '..', 'db', file), 'utf8');

try {
  await pool.query(await read('accounts.sql'));
  console.log('Practice accounts ready (their passwords are in the README)');
  // count(*) is a bigint, and pg returns it as text: ::int turns it into a normal number.
  const { rows } = await pool.query('SELECT count(*)::int AS products FROM products');
  if (rows[0].products > 0) {
    console.log('The database already has products: the sample ones are not loaded again');
  } else {
    await pool.query(await read('seed.sql'));
    console.log('Sample data loaded');
  }
} finally {
  await pool.end();
}
