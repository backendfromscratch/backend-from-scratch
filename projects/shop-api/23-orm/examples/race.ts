// Ten people buy the last mug left at the same time. Two ways to sell it: one sells ten mugs that
// don't exist, the other only one. It needs the database from .env; run it with:
// node --env-file=.env examples/race.ts
import { setTimeout as wait } from 'node:timers/promises';
import { pool } from '../src/db.ts';

const BUYERS = 10;

// #region wrong
// WRONG: reading the stock and, in another query, writing the new one. A while goes by between
// them (here, 50 ms on purpose; on a real server, however long it takes to do other things):
// everyone reads "1 left" before anyone writes, and everyone sells.
async function buyWrong(productId: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT stock FROM products WHERE id = $1', [productId]);
  const stock = rows[0].stock;
  if (stock < 1) return false;
  await wait(50);
  await pool.query('UPDATE products SET stock = $2 WHERE id = $1', [productId, stock - 1]);
  return true;
}
// #endregion wrong

// #region right
// RIGHT: checking and taking in the same query. While PostgreSQL changes the row, it locks it: the
// next buyer waits, and then looks at the stock the previous one left.
async function buyRight(productId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1',
    [productId],
  );
  return rowCount === 1;
}
// #endregion right

// #region race
// A test mug with stock 1, and all the buyers at once (Promise.all doesn't wait for one to finish
// before launching the next).
async function race(name: string, buy: (productId: number) => Promise<boolean>) {
  // Before starting, it opens the pool's ten connections: opening one takes longer than the 50 ms
  // pause, and without this some buyers would arrive late and each race would come out different.
  await Promise.all(Array.from({ length: BUYERS }, () => pool.query('SELECT pg_sleep(0.05)')));
  const { rows } = await pool.query(
    `INSERT INTO products (name, price_cents, stock)
     VALUES ('Race mug', 850, 1) RETURNING id`,
  );
  const id = rows[0].id;
  const purchases = await Promise.all(Array.from({ length: BUYERS }, () => buy(id)));
  const sold = purchases.filter((purchase) => purchase).length;
  const final = await pool.query('SELECT stock FROM products WHERE id = $1', [id]);
  console.log(`${name}: there was 1 mug left and ${sold} sold. Stock: ${final.rows[0].stock}`);
  await pool.query('DELETE FROM products WHERE id = $1', [id]); // the test mug goes away
}

await race('Wrong', buyWrong);
await race('Right', buyRight);
// #endregion race

await pool.end();
