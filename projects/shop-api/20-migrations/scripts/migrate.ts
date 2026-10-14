// Applies the missing migrations, in order. Run it with: npm run db:migrate
// Each migration is a .sql file in db/migrations/ with a number in front (001, 002…). It's
// applied only once: the migrations table records the ones already there.
// #region folder
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';

// The folder can be changed (the tests do it): npm run db:migrate -- another/folder
const folder = process.argv[2] ?? join(import.meta.dirname, '..', 'db', 'migrations');
// #endregion folder

// #region record
await pool.query(`
  CREATE TABLE IF NOT EXISTS migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);
const { rows } = await pool.query<{ name: string }>('SELECT name FROM migrations');
const applied = new Set(rows.map((row) => row.name));
// sort() sorts them by name: the number at the start decides the order.
const files = (await readdir(folder)).filter((file) => file.endsWith('.sql')).sort();
const pending = files.filter((file) => !applied.has(file));
// #endregion record

// #region apply
// A transaction goes entirely through the same connection: one is borrowed from the pool and
// given back at the end.
const client = await pool.connect();
try {
  for (const name of pending) {
    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(folder, name), 'utf8'));
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT'); // the migration and its record, together
      console.log(`Applied: ${name}`);
    } catch (error) {
      // ROLLBACK undoes everything this migration did: nothing is left half-done.
      await client.query('ROLLBACK');
      console.error(`${name} was not applied: ${(error as Error).message}`);
      process.exitCode = 1;
      break; // the next ones may depend on this one: they stop here
    }
  }
  if (pending.length === 0) {
    console.log('No new migrations: the database is up to date');
  }
} finally {
  client.release();
  await pool.end();
}
// #endregion apply
