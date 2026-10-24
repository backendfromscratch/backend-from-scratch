// Why a value is never pasted into a query. It needs the database from .env; run it with:
// node --env-file=.env examples/injection.ts
// It's SQL injection, one of the oldest and most common attacks: Phase 6 covers it in depth.
import { pool } from '../src/db.ts';

// #region pasted
// WRONG: the value the client sends, pasted into the query's text.
async function searchByPasting(name: string) {
  const query = `SELECT name FROM products WHERE name = '${name}' ORDER BY id`;
  console.log(`  The query: ${query}`);
  const { rows } = await pool.query(query);
  return rows.map((row) => row.name);
}
// #endregion pasted

// #region parameter
// RIGHT: the query carries $1, and the value travels separately. PostgreSQL gets the two things
// apart and never reads the value as SQL: it looks for a product with exactly that name.
async function searchWithParameter(name: string) {
  const query = 'SELECT name FROM products WHERE name = $1 ORDER BY id';
  const { rows } = await pool.query(query, [name]);
  return rows.map((row) => row.name);
}
// #endregion parameter

// #region try
// What someone types into the shop's search box: first, something normal; then, a value crafted
// so that its quote closes the query's. What comes after it, OR '1'='1', becomes part of the SQL,
// and it's true for every row.
for (const search of ['Mug', "x' OR '1'='1"]) {
  console.log(`\nSearching for: ${search}`);
  console.log('  Pasting the text, it finds:', await searchByPasting(search));
  console.log('  With a parameter, it finds:', await searchWithParameter(search));
}
// #endregion try

await pool.end();
