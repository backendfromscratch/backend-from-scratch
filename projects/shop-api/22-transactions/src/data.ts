// The shop's data, in PostgreSQL: it's no longer lost when the server stops. Each function is a
// query, and they're all async: the database is another program, at the other end of a
// connection, and you have to wait for its answer.
import { EventEmitter } from 'node:events';
import { inTransaction, pool } from './db.ts';

// From version 2, the price is in whole cents: 850, not 8.5. With decimals, money calculations end
// up off by a cent (lesson 6).
// stock: how many units are left (migration 002). Only version 2 shows it: version 1 doesn't change.
export interface Product {
  id: number;
  name: string;
  priceCents: number;
  stock: number;
}

// A cancelled order isn't deleted: it's still there, with its status, so it can be looked up later.
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

// createdAt: when it was placed, as ISO 8601 text in UTC (the final Z): 2026-10-13T09:30:00.000Z.
// JSON has no dates; this way any client, in any time zone, reads it the same.
export interface Order {
  id: number;
  productId: number;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
}

// #region columns
// The columns, with the name they have in the API: price_cents AS "priceCents". The quotes make
// PostgreSQL keep the capital letter (without them, it would make it lowercase). That way, each
// row is already a product just as it appears in the JSON. It's our own fixed text: nothing the
// client sends is ever pasted into a query.
const PRODUCT = 'id, name, price_cents AS "priceCents", stock';
export const ORDER = 'id, product_id AS "productId", quantity, status, created_at AS "createdAt"';

// pg turns each timestamptz into a JavaScript Date. The API gives it as text: toISOString()
// writes it in ISO 8601 and always in UTC, whatever the server's time zone.
export type OrderRow = Omit<Order, 'createdAt'> & { createdAt: Date };
export const toOrder = (row: OrderRow): Order => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
// #endregion columns

// #region list-products
// The sort order can't go in a parameter: a parameter is always a value, never a piece of SQL.
// That's why it's chosen from this fixed list, and what the client sends isn't written.
const SORT = { price: 'price_cents, id', '-price': 'price_cents DESC, id' };

export async function listProducts(
  filter: { maxCents?: number; sort?: keyof typeof SORT } = {},
): Promise<Product[]> {
  // $1::integer IS NULL: if there's no filter (null), the condition is true for all of them.
  const { rows } = await pool.query<Product>(
    `SELECT ${PRODUCT} FROM products
     WHERE $1::integer IS NULL OR price_cents <= $1
     ORDER BY ${filter.sort ? SORT[filter.sort] : 'id'}`,
    [filter.maxCents ?? null],
  );
  return rows;
}
// #endregion list-products

// #region find-product
// $1 is a parameter: the query and the value travel separately, and PostgreSQL never reads the
// value as SQL. If there's no row, rows[0] is undefined.
export async function findProduct(id: number): Promise<Product | undefined> {
  const { rows } = await pool.query<Product>(`SELECT ${PRODUCT} FROM products WHERE id = $1`, [id]);
  return rows[0];
}
// #endregion find-product

// #region create-product
// The id no longer comes from a counter: PostgreSQL sets it (GENERATED ALWAYS AS IDENTITY) and it
// never repeats, even if products are deleted. The stock starts at 0 (the column's DEFAULT).
// RETURNING returns the row just as it ended up.
export async function createProduct(name: string, priceCents: number): Promise<Product> {
  const { rows } = await pool.query<Product>(
    `INSERT INTO products (name, price_cents) VALUES ($1, $2) RETURNING ${PRODUCT}`,
    [name, priceCents],
  );
  return rows[0]!;
}
// #endregion create-product

// Returns false if it didn't exist. If it has orders, PostgreSQL won't let it be deleted and
// throws an error (23503), which becomes a 409 (problems.ts).
export async function deleteProduct(id: number): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
  return rowCount === 1;
}

// #region processed-events
// Writes down the id of a payment notification. If it was already there, the primary key stops it
// and ON CONFLICT DO NOTHING makes nothing happen: RETURNING returns no row. It's a single query,
// so even if the same notification arrives twice at once, only one writes it down. Returns
// whether it was new.
export async function recordEvent(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
    [id],
  );
  return rowCount === 1;
}
// #endregion processed-events

// #region notifications
// It announces each time an order changes status. Whoever wants to know (each connection that
// follows an order, in v2.ts) subscribes with .on('change', …) and unsubscribes with .off. It
// stays in memory: they're open connections to this server, not data to keep.
export const orderChanges = new EventEmitter<{ change: [Order] }>();
// No limit on listeners: each open connection is one, and there can be many.
orderChanges.setMaxListeners(0);

// Always change the status through here (or with cancelOrder, which also notifies), so that nobody
// misses the notification: first it's saved in the database and then the notification goes out.
export async function changeStatus(id: number, status: OrderStatus): Promise<Order> {
  const { rows } = await pool.query<OrderRow>(
    `UPDATE orders SET status = $2 WHERE id = $1 RETURNING ${ORDER}`,
    [id, status],
  );
  const order = toOrder(rows[0]!);
  orderChanges.emit('change', order);
  return order;
}
// #endregion notifications

export async function findOrder(id: number): Promise<Order | undefined> {
  const { rows } = await pool.query<OrderRow>(`SELECT ${ORDER} FROM orders WHERE id = $1`, [id]);
  return rows[0] && toOrder(rows[0]);
}

// #region create-order
// What can happen when placing an order: it goes well, the product doesn't exist or there isn't
// enough left.
export type OrderResult =
  { order: Order } | { error: 'not-found' } | { error: 'out-of-stock'; left: number };

// #region take-stock
// Taking the stock and saving the order, in a transaction: either both things, or neither.
export async function createOrder(productId: number, quantity: number): Promise<OrderResult> {
  return inTransaction(async (client) => {
    // Checking there's enough and taking it, in the same query (WHERE stock >= $2). If two orders
    // arrive at once, PostgreSQL locks the product's row while the first one changes it: the second
    // waits and looks at the stock the first one left. What isn't there is never sold.
    const taken = await client.query(
      'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
      [productId, quantity],
    );
    if (taken.rowCount === 0) {
      // No row changed: either the product doesn't exist, or there isn't enough left. Which one?
      const { rows } = await client.query<{ stock: number }>(
        'SELECT stock FROM products WHERE id = $1',
        [productId],
      );
      return rows[0] ? { error: 'out-of-stock', left: rows[0].stock } : { error: 'not-found' };
    }
    // #endregion take-stock
    // now(): the time the transaction started. PostgreSQL stores it with microseconds, but the API
    // gives it with milliseconds (.000Z): date_trunc leaves it in milliseconds, so that the cursor,
    // which carries the date, points exactly at this order.
    const { rows } = await client.query<OrderRow>(
      `INSERT INTO orders (product_id, quantity, status, created_at)
       VALUES ($1, $2, 'pending', date_trunc('milliseconds', now()))
       RETURNING ${ORDER}`,
      [productId, quantity],
    );
    return { order: toOrder(rows[0]!) };
  });
}
// #endregion create-order

// #region cancel-order
// Cancelling gives the stock back, in the same transaction as the status change. The UPDATE only
// cancels a pending or paid order: if two cancellations arrive at once, the second no longer finds
// it, and the stock is given back only once.
export async function cancelOrder(id: number): Promise<Order> {
  const cancelled = await inTransaction(async (client) => {
    const { rows } = await client.query<OrderRow>(
      `UPDATE orders SET status = 'cancelled'
       WHERE id = $1 AND status IN ('pending', 'paid')
       RETURNING ${ORDER}`,
      [id],
    );
    const row = rows[0];
    if (row === undefined) return undefined; // already cancelled, or shipped: nothing to give back
    await client.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [
      row.productId,
      row.quantity,
    ]);
    return toOrder(row);
  });
  if (cancelled === undefined) return (await findOrder(id))!;
  // The notification, after the COMMIT: whoever gets it can already read the change in the database.
  orderChanges.emit('change', cancelled);
  return cancelled;
}
// #endregion cancel-order

export async function changeQuantity(id: number, quantity: number): Promise<Order> {
  const { rows } = await pool.query<OrderRow>(
    `UPDATE orders SET quantity = $2 WHERE id = $1 RETURNING ${ORDER}`,
    [id, quantity],
  );
  return toOrder(rows[0]!);
}
