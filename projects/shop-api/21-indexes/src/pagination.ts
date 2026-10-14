// Splitting a long list into pages, in two ways: with an offset ("skip the first 10") or with a
// cursor ("give me the ones that come after this one"). Both now in SQL: PostgreSQL returns only
// the page's orders.
import { ORDER, toOrder, type OrderRow, type OrderStatus } from './data.ts';
import { pool } from './db.ts';

// #region cursor
// The cursor carries the date and the id of the page's last order, in base64url. It used to carry
// only the id; since the client doesn't have to understand it, only send it back, the server has
// been able to change what it carries inside without breaking anyone. The only thing: an old
// cursor is no longer valid (422), and the client has to start again from the first page.
export interface Cursor {
  createdAt: string;
  id: number;
}

export function createCursor(order: Cursor): string {
  return Buffer.from(JSON.stringify([order.createdAt, order.id])).toString('base64url');
}

// If the text wasn't a cursor, it returns null, and the schema rejects it.
export function readCursor(cursor: string): Cursor | null {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return { createdAt, id };
  } catch {
    return null;
  }
}
// #endregion cursor

// #region page-by-cursor
// #region cursor-query
// (created_at, id) < ($1, $2) compares the two columns at once, the way words are sorted in a
// dictionary: first the date and, if it's the same, the id. They're the orders that come after the
// cursor. The index from migration 003 has this same order: PostgreSQL goes straight to the cursor
// and reads only the page's orders, whether there are 25 orders or a million.
export const ORDERS_BY_CURSOR = `
  SELECT ${ORDER} FROM orders
  WHERE (created_at, id) < ($1, $2) AND ($3::text IS NULL OR status = $3)
  ORDER BY created_at DESC, id DESC
  LIMIT $4`;
// #endregion cursor-query

// It asks for one more than fits on the page: if it arrives, there's another page after this one.
export async function pageByCursor(limit: number, after?: Cursor, status?: OrderStatus) {
  // Without a cursor, the first page: the ones that come "after" infinity, which is all of them.
  const { createdAt, id } = after ?? { createdAt: 'infinity', id: 0 };
  const { rows } = await pool.query<OrderRow>(ORDERS_BY_CURSOR, [
    createdAt,
    id,
    status ?? null,
    limit + 1,
  ]);
  const page = rows.slice(0, limit).map(toOrder);
  const hasMore = rows.length > limit;
  return { page, next: hasMore ? createCursor(page.at(-1)!) : undefined };
}
// #endregion page-by-cursor

// #region page-by-offset
// Skip the first "offset" and give me "limit". It's the most direct way, but if a new order comes
// in between one page and the next, everything shifts one place and an order shows up twice. And
// OFFSET doesn't skip the rows for free: PostgreSQL reads them and throws them away. Page 1000
// reads 10,000.
export async function pageByOffset(limit: number, offset: number, status?: OrderStatus) {
  const { rows } = await pool.query<OrderRow>(
    `SELECT ${ORDER} FROM orders
     WHERE $1::text IS NULL OR status = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [status ?? null, limit + 1, offset],
  );
  const page = rows.slice(0, limit).map(toOrder);
  const hasMore = rows.length > limit;
  return { page, next: hasMore ? offset + limit : undefined };
}
// #endregion page-by-offset

// #region link
// The Link header (RFC 8288) says where the next page is: the same URL, with another cursor.
// The client doesn't have to build it, only follow it.
export function nextLink(currentUrl: string, parameter: string, value: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set(parameter, value);
  return `<${url.href}>; rel="next"`;
}
// #endregion link
