/**
 * The worker where PostgreSQL runs (spec §4.1): a query that never ends blocks this thread, not
 * the page, and the page can end it (client.ts, stop). Started on the first «Ejecutar».
 */
import { openDatabase, type Database } from './database';
import type { Request, Response } from './protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response): void;
};

let database: Promise<Database> | undefined;

scope.onmessage = async ({ data: { id, sql, setup } }) => {
  try {
    database ??= openDatabase(setup);
    scope.postMessage({ id, ok: true, reply: await (await database).run(sql) });
  } catch {
    // SQL errors are part of the reply; this is the engine itself failing (it could not start).
    database = undefined;
    scope.postMessage({ id, ok: false });
  }
};
