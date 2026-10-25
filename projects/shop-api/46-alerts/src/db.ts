// The connection to PostgreSQL. The server, the scripts and the examples use it.
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// #region pool
// The database's address, from .env: postgres://user:password@server:port/database
const url = process.env.DATABASE_URL;
if (url === undefined) {
  console.error('Configuration: DATABASE_URL: DATABASE_URL is missing (see .env.example)');
  process.exit(1);
}

// A pool: a few open connections that the requests borrow in turn. Opening a connection costs
// (TCP, the password, setting up the session); reusing an open one, almost nothing. At most 10 at
// a time: if more queries arrive, they wait their turn.
export const pool = new Pool({ connectionString: url, max: 10 });

// If PostgreSQL closes a connection that was waiting in the pool (because it restarts, for
// example), the pool reports it with an 'error'. With nobody listening, Node would stop the server.
pool.on('error', (error) => {
  console.error('PostgreSQL closed a connection in the pool:', error.message);
});
// #endregion pool

// #region borrowed-connection
// The same with a borrowed connection, the one a request or the relayer is using (Phase 10, lesson
// 6). The pool only listens to the 'error' of the ones waiting in it: while one is borrowed, nobody.
// If PostgreSQL cuts it then (it restarts, or idle_in_transaction_session_timeout closes a
// transaction that has spent 5 s without saying anything, in outbox.ts), the 'error' had nobody to
// listen to it and Node stopped the whole process. Now it is listened to on each new connection:
// the query that was waiting fails with its error, like any other, and the process goes on. (One
// that waits in the pool says it twice: here and in the pool.on('error') above.)
// console.warn, and not the shop's log (log.ts): this file is also used by scripts that don't have
// the API's configuration (migrate, seed), and log.ts requires it.
pool.on('connect', (client) => {
  client.on('error', (error) => {
    console.warn('PostgreSQL cut a connection:', error.message);
  });
});
// #endregion borrowed-connection

// #region drizzle
// Drizzle, on top of the same pool: it doesn't open connections of its own, it uses pg's. schema
// gives it the tables and their relations (schema.ts). Transactions are done by db.transaction(),
// which does the same as lesson 8's inTransaction: a client from the pool, BEGIN, and COMMIT or
// ROLLBACK.
export const db = drizzle({ client: pool, schema });
// #endregion drizzle

// #region transaction
// What the function of db.transaction(async (tx) => …) receives: tx has the same queries as db, but
// all of them go through the transaction's connection. With this type, a function can ask to be
// called inside one (saveOutbox, in outbox.ts).
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// #endregion transaction
