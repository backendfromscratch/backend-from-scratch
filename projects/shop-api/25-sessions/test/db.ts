// The tests' database (DATABASE_URL, in test/.env). Each test file prepares it when it starts, so
// the order they run in doesn't matter.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before } from 'node:test';
import { promisify } from 'node:util';
import { pool } from '../src/db.ts';

export const run = promisify(execFile);

/** Leaves it empty: drops the public schema, with all its tables, and creates it again. */
export async function emptyDb() {
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    throw new Error(
      `Can't use the tests' database (DATABASE_URL, in test/.env). ` +
        `Is PostgreSQL running? (${code ?? ''} ${message})`,
    );
  }
}

/**
 * Empties the database, applies the migrations and loads the sample data: what npm run db:migrate
 * and npm run db:seed do, but without starting another process for each one, which is slower. The
 * real scripts are tested in modeling.test.ts and migrations.test.ts.
 */
export async function prepareDb() {
  await emptyDb();
  for (const name of (await readdir('db/migrations')).sort()) {
    await pool.query(await readFile(join('db/migrations', name), 'utf8'));
  }
  await pool.query(await readFile('db/accounts.sql', 'utf8'));
  await pool.query(await readFile('db/seed.sql', 'utf8'));
}

/** The database, prepared before the file's first test and closed after the last one. */
export function useDb() {
  before(prepareDb);
  after(() => pool.end());
}
