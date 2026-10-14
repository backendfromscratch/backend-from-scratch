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

// #region drizzle
// Drizzle, on top of the same pool: it doesn't open connections of its own, it uses pg's. schema
// gives it the tables and their relations (schema.ts). Transactions are done by db.transaction(),
// which does the same as lesson 8's inTransaction: a client from the pool, BEGIN, and COMMIT or
// ROLLBACK.
export const db = drizzle({ client: pool, schema });
// #endregion drizzle
