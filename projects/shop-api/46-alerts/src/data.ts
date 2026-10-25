// The shop's data, in PostgreSQL, now with Drizzle: the queries are written in TypeScript, with the
// tables in schema.ts, and Drizzle turns them into SQL with parameters ($1, $2…). TypeScript knows
// what columns each row has and what type they are.
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { fromCache, forget } from './cache.ts';
import { db, type Transaction } from './db.ts';
import { orderChanges } from './order-events.ts';
import { categories, orders, processedEvents, productCategories, products } from './schema.ts';

// From version 2, the price is in whole cents: 850, not 8.5. With decimals, money calculations end
// up off by a cent (lesson 6).
// stock: how many units are left (migration 002). categories: the names of its categories. Both
// only in version 2: version 1 doesn't change.
export interface Product {
  id: number;
  name: string;
  priceCents: number;
  stock: number;
  categories: string[];
}

// A cancelled order isn't deleted: it's still there, with its status, so it can be looked up later.
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

// createdAt: when it was placed, as ISO 8601 text in UTC (the final Z): 2026-10-13T09:30:00.000Z.
// JSON has no dates; this way any client, in any time zone, reads it the same.
// customerId: whose it is (Phase 6, lesson 5); null in the orders from before the accounts.
export interface Order {
  id: number;
  productId: number;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  customerId: number | null;
}

// #region columns
// Drizzle already returns each row with the API's names (priceCents, createdAt): schema.ts sets
// them. Only the date is left: Drizzle gives a JavaScript Date, and the API, text. toISOString()
// writes it in ISO 8601 and always in UTC, whatever the server's time zone.
export type OrderRow = typeof orders.$inferSelect;
export const toOrder = (row: OrderRow): Order => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
// #endregion columns

// #region list-products
// with: the products with their categories, in a single query (lesson 9: the N+1 problem). Drizzle
// brings each product with its rows from product_categories and, in each one, its category.
const withCategories = {
  categories: {
    with: { category: true },
    orderBy: asc(productCategories.categoryId),
  },
} as const;

// What comes from a query with withCategories, the way the API gives it: of each category, the name.
type ProductWithCategories = typeof products.$inferSelect & {
  categories: { category: { name: string } }[];
};

function toProduct({ categories, ...product }: ProductWithCategories): Product {
  return { ...product, categories: categories.map((row) => row.category.name) };
}

// The ids of the products in a category, whatever the capital letters: clothing, Clothing or
// CLOTHING. It's a query inside another one (a subquery); ${category} is a parameter, like $1.
const inCategory = (category: string) =>
  db
    .select({ id: productCategories.productId })
    .from(productCategories)
    .innerJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(sql`lower(${categories.name}) = lower(${category})`);

// The sort order, from a fixed list: asc and desc are Drizzle functions, not text from the client.
const SORT = {
  price: [asc(products.priceCents), asc(products.id)],
  '-price': [desc(products.priceCents), asc(products.id)],
};

type Filter = { maxCents?: number; sort?: keyof typeof SORT; category?: string };

// Reads from PostgreSQL. The API calls listProducts (further down), which looks in the cache first.
async function readProducts(filter: Filter): Promise<Product[]> {
  // and() skips the conditions that are undefined: it only filters by what has arrived.
  const rows = await db.query.products.findMany({
    where: and(
      filter.maxCents === undefined ? undefined : lte(products.priceCents, filter.maxCents),
      filter.category === undefined ? undefined : inArray(products.id, inCategory(filter.category)),
    ),
    orderBy: filter.sort ? SORT[filter.sort] : [asc(products.id)],
    with: withCategories,
  });
  return rows.map(toProduct);
}
// #endregion list-products

// #region find-product
// findFirst: the first row that matches where, or undefined if there's none.
async function readProduct(id: number): Promise<Product | undefined> {
  const row = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: withCategories,
  });
  return row && toProduct(row);
}
// #endregion find-product

// #region from-cache
// The catalogue, with a cache (cache.ts, Phase 9): what is asked for most and changes least. Each
// list has its own key, because each filter gives another: products:list:{} is the whole list, and
// products:list:{"sort":"price"}, the one sorted by price. The filter, as JSON, always with the
// fields in the same order (the one of this object), and without the ones that haven't arrived.
// Each product, in products:<id>. A minute at most without asking PostgreSQL: if something
// changes, it is deleted before then (forgetProducts).
const SECONDS_IN_CACHE = 60;

export function listProducts(filter: Filter = {}): Promise<Product[]> {
  const { maxCents, sort, category } = filter;
  const key = `products:list:${JSON.stringify({ maxCents, sort, category })}`;
  return fromCache(key, SECONDS_IN_CACHE, () => readProducts(filter));
}

export function findProduct(id: number): Promise<Product | undefined> {
  return fromCache(`products:${id}`, SECONDS_IN_CACHE, () => readProduct(id));
}
// #endregion from-cache

// #region forget-products
// What to delete from the cache when a product changes, its stock too: the product (or products)
// and every list, because they carry it inside. Always after the COMMIT.
const forgetProducts = (...ids: number[]) =>
  forget(...ids.map((id) => `products:${id}`), 'products:list:*');
// #endregion forget-products

// #region create-product
// PostgreSQL sets the id and the stock starts at 0 (the column's DEFAULT). returning() is SQL's
// RETURNING: the row just as it ended up. A new product has no categories.
export async function createProduct(name: string, priceCents: number): Promise<Product> {
  const [product] = await db.insert(products).values({ name, priceCents }).returning();
  // One more in the catalogue: the lists already stored are no longer the truth.
  await forgetProducts(product!.id);
  return { ...product!, categories: [] };
}
// #endregion create-product

// Returns false if it didn't exist. If it has orders, PostgreSQL won't let it be deleted and
// throws an error (23503), which becomes a 409 (problems.ts).
export async function deleteProduct(id: number): Promise<boolean> {
  const deleted = await db.delete(products).where(eq(products.id, id)).returning();
  if (deleted.length === 0) return false;
  await forgetProducts(id);
  return true;
}

// #region update-product
// Changes the name, the price or both (whichever arrive: Drizzle skips the undefined ones). After
// the change, the product and the lists go out of the cache; and the product is read again from
// PostgreSQL, with its categories, just as it ended up. undefined if it doesn't exist.
export async function updateProduct(
  id: number,
  changes: { name?: string | undefined; priceCents?: number | undefined },
): Promise<Product | undefined> {
  const changed = await db
    .update(products)
    .set(changes)
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (changed.length === 0) return undefined;
  await forgetProducts(id);
  return readProduct(id);
}
// #endregion update-product

// #region processed-events
// Writes down the id of a payment notification. If it was already there, the primary key stops it
// and onConflictDoNothing (ON CONFLICT DO NOTHING) makes nothing happen: returning returns no row.
// It's a single query, so even if the same notification arrives twice at once, only one writes it
// down. Returns whether it was new.
// tx: since Phase 9 (lesson 7), inside the payment's transaction (v2.ts). If the notification
// arrives twice at once, the second INSERT waits for the first transaction to finish: with COMMIT,
// it was already there; with ROLLBACK, it writes it down itself.
export async function recordEvent(id: string, tx: Transaction | typeof db = db): Promise<boolean> {
  const recorded = await tx
    .insert(processedEvents)
    .values({ id })
    .onConflictDoNothing()
    .returning();
  return recorded.length === 1;
}
// #endregion processed-events

// #region notifications
// It announces each time an order changes status. Whoever wants to know (each connection that
// follows an order, in v2.ts) subscribes with orderChanges.listen(…) and stops listening when it
// leaves. Since Phase 9, the notice goes through Redis to all the API's copies (order-events.ts),
// not just this one: whoever follows the order may be connected to another.

// Always change the status through here (or with cancelOrder, which also notifies), so that nobody
// misses the notification: first it's saved in the database and then the notification goes out.
// With from, it only changes it if the order is still in that status, in the same UPDATE (like when
// taking the stock off): if another request changed it first, a cancellation for example, it
// changes nothing, doesn't notify and returns undefined.
export async function changeStatus(
  id: number,
  status: OrderStatus,
  from?: OrderStatus,
): Promise<Order | undefined> {
  // and() skips the condition that is undefined: without from, it only looks at the id.
  const [row] = await db
    .update(orders)
    .set({ status })
    .where(and(eq(orders.id, id), from === undefined ? undefined : eq(orders.status, from)))
    .returning();
  if (row === undefined) return undefined;
  const order = toOrder(row);
  orderChanges.emit(order);
  return order;
}
// #endregion notifications

// #region change-status-in
// The same, inside a transaction (tx), and only if the order is in the status from: if not (another
// request changed it first), it changes nothing and returns undefined. The check is in the same
// UPDATE, like when taking the stock off (createOrder). It doesn't notify: the caller notifies after
// the COMMIT (orderChanges.emit), when the change can already be read.
export async function changeStatusIn(
  tx: Transaction,
  id: number,
  status: OrderStatus,
  from: OrderStatus,
): Promise<Order | undefined> {
  const [row] = await tx
    .update(orders)
    .set({ status })
    .where(and(eq(orders.id, id), eq(orders.status, from)))
    .returning();
  return row && toOrder(row);
}
// #endregion change-status-in

export async function findOrder(id: number): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row && toOrder(row);
}

// #region create-order
// What can happen when placing an order: it goes well, the product doesn't exist or there isn't
// enough left.
export type OrderResult =
  { order: Order } | { error: 'not-found' } | { error: 'out-of-stock'; left: number };

// Taking the stock and saving the order, in a transaction: either both things, or neither. tx is
// the transaction: everything that goes through tx goes through the same connection. customerId:
// whose the order is.
export async function createOrder(
  productId: number,
  quantity: number,
  customerId: number,
): Promise<OrderResult> {
  const result = await db.transaction(async (tx): Promise<OrderResult> => {
    // Lesson 8's conditional UPDATE, with the query builder: it reads almost the same as the SQL
    // (SET stock = stock - $2 WHERE id = $1 AND stock >= $2). For the subtraction, a piece of SQL
    // (sql`…`): with Drizzle, what matters here, that the check and the change go in the same
    // query, stays in sight.
    const taken = await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${quantity}` })
      .where(and(eq(products.id, productId), gte(products.stock, quantity)))
      .returning({ stock: products.stock });
    if (taken.length === 0) {
      // No row changed: either the product doesn't exist, or there isn't enough left. Which one?
      const [product] = await tx
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId));
      return product ? { error: 'out-of-stock', left: product.stock } : { error: 'not-found' };
    }
    // now(): the time the transaction started. PostgreSQL stores it with microseconds, but the API
    // gives it with milliseconds (.000Z): date_trunc leaves it in milliseconds, so that the cursor,
    // which carries the date, points exactly at this order.
    const [row] = await tx
      .insert(orders)
      .values({
        productId,
        quantity,
        status: 'pending',
        createdAt: sql`date_trunc('milliseconds', now())`,
        customerId,
      })
      .returning();
    return { order: toOrder(row!) };
  });
  // #region order-forgets
  // The stock has gone down: the product and the lists go out of the cache, after the COMMIT. The
  // stock check above never looks at the cache: PostgreSQL does it, in the transaction. An old
  // number in the cache can be seen in the shop for a moment, but it can't be sold.
  if ('order' in result) await forgetProducts(productId);
  return result;
  // #endregion order-forgets
}
// #endregion create-order

// #region cancel-order
// Cancelling gives the stock back, in the same transaction as the status change. The UPDATE only
// cancels a pending or paid order: if two cancellations arrive at once, the second no longer finds
// it, and the stock is given back only once.
export async function cancelOrder(id: number): Promise<Order> {
  const cancelled = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({ status: 'cancelled' })
      .where(and(eq(orders.id, id), inArray(orders.status, ['pending', 'paid'])))
      .returning();
    if (row === undefined) return undefined; // already cancelled, or shipped: nothing to give back
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${row.quantity}` })
      .where(eq(products.id, row.productId));
    return toOrder(row);
  });
  if (cancelled === undefined) return (await findOrder(id))!;
  // The stock is back: out of the cache, as when the order was placed.
  await forgetProducts(cancelled.productId);
  // The notification, after the COMMIT: whoever gets it can already read the change in the database.
  orderChanges.emit(cancelled);
  return cancelled;
}
// #endregion cancel-order

// What can happen when changing the quantity: it goes well, the order is no longer pending or there
// isn't enough stock for the extra units (more: how many are asked for on top of the current ones).
export type ChangeResult =
  | { order: Order }
  | { error: 'status'; status: OrderStatus }
  | { error: 'out-of-stock'; more: number; left: number };

// Changing the quantity also changes the stock, in the same transaction: if more are asked for, the
// extra ones are taken (if there are enough left); if fewer, the difference is given back.
export async function changeQuantity(id: number, quantity: number): Promise<ChangeResult> {
  const result = await db.transaction(async (tx): Promise<ChangeResult> => {
    // for('update') is SQL's FOR UPDATE: it locks the order's row until the COMMIT. If a payment or a
    // cancellation arrives at the same time, it waits for this to finish (or this waits for the
    // other one, and reads what it left). The order first and then the product, in the same order as
    // cancelOrder: if each locked a different row first, the two would end up waiting for each other.
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    const order = row!; // it exists: the route already looked it up, and orders are never deleted
    // The route already looked at the status, but before the lock: meanwhile it may have been paid.
    if (order.status !== 'pending') return { error: 'status', status: order.status };
    const difference = quantity - order.quantity;
    if (difference > 0) {
      // The extra ones, with the same conditional UPDATE as when placing the order.
      const taken = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${difference}` })
        .where(and(eq(products.id, order.productId), gte(products.stock, difference)))
        .returning({ stock: products.stock });
      if (taken.length === 0) {
        const [product] = await tx
          .select({ stock: products.stock })
          .from(products)
          .where(eq(products.id, order.productId));
        return { error: 'out-of-stock', more: difference, left: product!.stock };
      }
    } else if (difference < 0) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${-difference}` })
        .where(eq(products.id, order.productId));
    }
    const [changed] = await tx
      .update(orders)
      .set({ quantity })
      .where(eq(orders.id, id))
      .returning();
    return { order: toOrder(changed!) };
  });
  // The stock has changed (unless the quantity was the same): out of the cache, after the COMMIT,
  // like when placing the order.
  if ('order' in result) await forgetProducts(result.order.productId);
  return result;
}
