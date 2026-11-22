// The tests' database (DATABASE_URL, in test/.env). Each test file prepares it when it starts, so
// the order they run in doesn't matter.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before } from 'node:test';
import { promisify } from 'node:util';
import { pool } from '../src/db.ts';

export const run = promisify(execFile);

/**
 * Leaves it empty: drops every table in the public schema. Until Phase 10 it dropped the whole
 * schema and created it again; since Phase 11 it doesn't, because the vector extension lives in it
 * (migration 014), and turning it on again is a superuser's job: your PostgreSQL's shop role
 * couldn't. This way, the extension is turned on once (the README says how) and stays.
 */
export async function emptyDb() {
  try {
    // format('%I'): each name in quotes if needed, as PostgreSQL would write it.
    const { rows } = await pool.query<{ name: string }>(
      `SELECT format('%I', tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length > 0) {
      await pool.query(`DROP TABLE ${rows.map((row) => row.name).join(', ')} CASCADE`);
    }
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
    try {
      await pool.query(await readFile(join('db/migrations', name), 'utf8'));
    } catch (error) {
      // 42501: no permission. Here, the one to turn on the vector extension (migration 014).
      if ((error as { code?: string }).code === '42501' && /extension/.test(String(error))) {
        throw new Error(
          "The tests' database doesn't have the vector extension, and the shop role can't turn " +
            'it on: turn it on yourself, as a superuser (README, Phase 11): ' +
            'psql -d shop_test -c "CREATE EXTENSION vector"',
        );
      }
      throw error;
    }
  }
  await pool.query(await readFile('db/accounts.sql', 'utf8'));
  await pool.query(await readFile('db/seed.sql', 'utf8'));
}

/**
 * The database, prepared before the file's first test and closed after the last one. If it's given
 * a function, it runs it as soon as the database is ready: to create the tests' sessions, for
 * example (identities.ts).
 */
export function useDb(afterwards?: () => Promise<void>) {
  before(async () => {
    await prepareDb();
    await afterwards?.();
  });
  after(() => pool.end());
}
