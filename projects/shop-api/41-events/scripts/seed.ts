// Loads the practice data. Run it with: npm run db:seed
// - db/accounts.sql: the practice accounts (Phase 6). Always: the ones already there aren't
//   repeated. That way whoever carries on with the Phase 5 database, which already has data, gets
//   them too. With --no-accounts (npm run db:seed:production) they aren't loaded: their passwords
//   are public, and in production the first account is created with npm run create-admin.
// - db/seed.sql: the sample products, categories and orders, only if there isn't any product yet:
//   in a database that already has them, it would repeat them.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pool } from '../src/db.ts';

const read = (file: string) => readFile(join(import.meta.dirname, '..', 'db', file), 'utf8');

// Strict: an argument that isn't --no-accounts (a typo, say) stops the script before loading
// anything. Otherwise a typo would load the practice accounts, with public passwords, in
// production.
let noAccounts: boolean;
try {
  noAccounts =
    parseArgs({ options: { 'no-accounts': { type: 'boolean' } }, strict: true }).values[
      'no-accounts'
    ] === true;
} catch (error) {
  console.error(`Invalid argument: ${(error as Error).message}`);
  console.error('Usage: npm run db:seed, or npm run db:seed:production (with --no-accounts)');
  process.exit(1);
}

try {
  if (noAccounts) {
    console.log('No practice accounts: they are not loaded (--no-accounts)');
  } else {
    await pool.query(await read('accounts.sql'));
    console.log('Practice accounts ready (their passwords are in the README)');
  }
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
