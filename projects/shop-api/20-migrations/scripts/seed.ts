// Loads the sample data (db/seed.sql) into a freshly migrated database, still empty. In one that
// already has data, it would repeat it: then it refuses. Run it with: npm run db:seed
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';

try {
  // count(*) is a bigint, and pg returns it as text: ::int turns it into a normal number.
  const { rows } = await pool.query('SELECT count(*)::int AS products FROM products');
  if (rows[0].products > 0) {
    console.error('The database already has products: npm run db:seed is only for an empty one');
    process.exitCode = 1;
  } else {
    await pool.query(await readFile(join(import.meta.dirname, '..', 'db', 'seed.sql'), 'utf8'));
    console.log('Sample data loaded');
  }
} finally {
  await pool.end();
}
