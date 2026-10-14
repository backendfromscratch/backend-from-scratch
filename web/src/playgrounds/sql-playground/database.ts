/**
 * A PostgreSQL in memory (PGlite) with the shop's data. In the browser it runs inside worker.ts;
 * in the tests, in Node, with the same engine.
 */
import { PGlite } from '@electric-sql/pglite';
import {
  describeError,
  toOutput,
  TEXT_PARSERS,
  type DbError,
  type ErrorView,
  type Output,
} from './results';
import { isMetaCommand, splitStatements } from './statements';

export interface Reply {
  outputs: Output[];
  error?: ErrorView;
  /** The psql command the reader typed (\dt…): it is explained, not run. */
  meta?: string;
}

export interface Database {
  run(sql: string): Promise<Reply>;
  close(): Promise<void>;
}

export async function openDatabase(setup: string): Promise<Database> {
  const db = await PGlite.create();
  // PGlite takes the time zone of the reader's computer: in UTC, every reader sees the same dates
  // (2026-10-01 09:00:00+00), the ones the lessons show.
  await db.exec(`SET TIME ZONE 'UTC'`);
  await db.exec(setup);
  return {
    async run(sql) {
      const outputs: Output[] = [];
      for (const statement of splitStatements(sql)) {
        if (isMetaCommand(statement)) return { outputs, meta: statement.text.split(/\s/)[0]! };
        try {
          const result = await db.query<unknown[]>(statement.text, [], {
            rowMode: 'array',
            parsers: TEXT_PARSERS,
          });
          outputs.push(toOutput(result));
        } catch (error) {
          return { outputs, error: describeError(sql, error as DbError, statement.offset) };
        }
      }
      return { outputs };
    },
    close: () => db.close(),
  };
}
