// The tests' database (DATABASE_URL, in test/.env). Each test file prepares it when it starts, so
// the order they run in doesn't matter.
import { execFile } from 'node:child_process';
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

/** Empties the database and fills it with npm run db:create. Returns what the script says. */
export async function prepareDb(): Promise<string> {
  await emptyDb();
  const { stdout } = await run('node', ['scripts/create-db.ts']);
  return stdout;
}

/** The database, prepared before the file's first test and closed after the last one. */
export function useDb() {
  before(prepareDb);
  after(() => pool.end());
}
