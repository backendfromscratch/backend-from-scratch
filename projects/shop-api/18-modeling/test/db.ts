// The tests' database (DATABASE_URL, in test/.env). Each test file prepares it when it starts, so
// the order they run in doesn't matter.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';

export const run = promisify(execFile);

export const db = new Pool({ connectionString: process.env.DATABASE_URL });

/** Leaves it empty: drops the public schema, with all its tables, and creates it again. */
export async function emptyDb() {
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
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
