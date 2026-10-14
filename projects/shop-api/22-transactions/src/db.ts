// The connection to PostgreSQL. The server, the scripts and the examples use it.
import { Pool, type PoolClient } from 'pg';

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

// #region in-transaction
// Runs fn in a transaction: either everything it does is saved, or nothing. BEGIN, the queries and
// COMMIT have to go through the same connection, so fn gets a client from the pool and does
// everything with it. If fn throws an error, ROLLBACK undoes whatever it had done, and the error
// goes on its way.
export async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // The connection goes back to the pool, whatever happens: otherwise, in the end there would be
    // none free.
    client.release();
  }
}
// #endregion in-transaction
