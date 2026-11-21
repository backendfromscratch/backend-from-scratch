// Splitting a long list into pages, in two ways: with an offset ("skip the first 10") or with a
// cursor ("give me the ones that come after this one"). Both now in SQL: PostgreSQL returns only
// the page's orders.
import { and, desc, eq, sql } from 'drizzle-orm';
import { toOrder, type OrderStatus } from './data.ts';
import { db } from './db.ts';
import { orders } from './schema.ts';

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
// (created_at, id) < (date, id) compares the two columns at once, the way words are sorted in a
// dictionary: first the date and, if it's the same, the id. They're the orders that come after the
// cursor. Drizzle has no function to compare two columns at once: that piece goes in SQL (sql`…`),
// with the values as parameters. The index from migration 003 has this same order. With Drizzle, a
// condition that isn't needed (no cursor, no status) stays undefined, and and() skips it: the
// infinity trick is no longer needed.
// customerId (Phase 6, lesson 5): if it comes, only that customer's orders.
export function queryByCursor(
  limit: number,
  after?: Cursor,
  status?: OrderStatus,
  customerId?: number,
) {
  return db
    .select()
    .from(orders)
    .where(
      and(
        after && sql`(${orders.createdAt}, ${orders.id}) < (${after.createdAt}, ${after.id})`,
        status && eq(orders.status, status),
        customerId === undefined ? undefined : eq(orders.customerId, customerId),
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit);
}

// It asks for one more than fits on the page: if it arrives, there's another page after this one.
export async function pageByCursor(
  limit: number,
  after?: Cursor,
  status?: OrderStatus,
  customerId?: number,
) {
  const rows = await queryByCursor(limit + 1, after, status, customerId);
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
export async function pageByOffset(
  limit: number,
  offset: number,
  status?: OrderStatus,
  customerId?: number,
) {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        status && eq(orders.status, status),
        customerId === undefined ? undefined : eq(orders.customerId, customerId),
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit + 1)
    .offset(offset);
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
