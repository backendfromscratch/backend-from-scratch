// Splitting a long list into pages, in two ways: with an offset ("skip the first 10") or with a
// cursor ("give me the ones that come after this one").
import type { Order } from './data.ts';

// #region cursor
// The cursor is the id of the page's last order, in base64url. The client doesn't have to
// understand it: only send it back to ask for the next page. That way the server can change what
// it carries inside without breaking anyone.
export function createCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64url');
}

// If the text wasn't a cursor, the result is NaN or 0, and the schema rejects it.
export function readCursor(cursor: string): number {
  return Number(Buffer.from(cursor, 'base64url').toString());
}
// #endregion cursor

// #region page-by-cursor
// The list goes from newest to oldest: the ones after the cursor are the ones with a lower id.
// Even if new orders come in, the cursor still points at the same place.
export function pageByCursor(list: Order[], limit: number, after?: number) {
  const remaining = after === undefined ? list : list.filter((order) => order.id < after);
  const page = remaining.slice(0, limit);
  const hasMore = remaining.length > limit;
  return { page, next: hasMore ? createCursor(page.at(-1)!.id) : undefined };
}
// #endregion page-by-cursor

// #region page-by-offset
// Skip the first "offset" and give me "limit". It's the most direct way, but if a new order comes
// in between one page and the next, everything shifts one place and an order shows up twice.
export function pageByOffset(list: Order[], limit: number, offset: number) {
  const page = list.slice(offset, offset + limit);
  const hasMore = list.length > offset + limit;
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
