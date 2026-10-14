// The shop's data, in memory: it's lost when the server stops. The database arrives in
// Phase 5.
import { EventEmitter } from 'node:events';

// From version 2, the price is in whole cents: 850, not 8.5. With decimals, money calculations end
// up off by a cent (lesson 6).
export interface Product {
  id: number;
  name: string;
  priceCents: number;
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

export const products: Product[] = [
  { id: 1, name: 'T-shirt', priceCents: 2000 },
  { id: 2, name: 'Mug', priceCents: 850 },
  { id: 3, name: 'Hoodie', priceCents: 3500 },
];

export const orders: Order[] = [];

export function findProduct(id: number): Product | undefined {
  return products.find((product) => product.id === id);
}

// The id can no longer be "how many there are + 1": if 2 is deleted from [1, 2, 3], two are left,
// and the next one would be 3 again. A counter that only goes up never repeats an id.
let lastProductId = products.length;

export function createProduct(name: string, priceCents: number): Product {
  lastProductId = lastProductId + 1;
  const product: Product = { id: lastProductId, name, priceCents };
  products.push(product);
  return product;
}

// Returns false if it didn't exist.
export function deleteProduct(id: number): boolean {
  const position = products.findIndex((product) => product.id === id);
  if (position === -1) return false;
  products.splice(position, 1);
  return true;
}

// The ids of the payment events already processed, so the same one isn't processed twice.
export const processedEvents = new Set<string>();

// #region notifications
// It announces each time an order changes status. Whoever wants to know (each connection that
// follows an order, in v2.ts) subscribes with .on('change', …) and unsubscribes with .off.
export const orderChanges = new EventEmitter<{ change: [Order] }>();
// No limit on listeners: each open connection is one, and there can be many.
orderChanges.setMaxListeners(0);

// Always change the status through here, so that nobody misses the notification.
export function changeStatus(order: Order, status: OrderStatus) {
  order.status = status;
  orderChanges.emit('change', order);
}
// #endregion notifications

export function findOrder(id: number): Order | undefined {
  return orders.find((order) => order.id === id);
}

// toISOString() always gives the date in UTC, whatever the server's time zone.
export function createOrder(productId: number, quantity: number, createdAt = new Date()): Order {
  const order: Order = {
    id: orders.length + 1,
    productId,
    quantity,
    status: 'pending',
    createdAt: createdAt.toISOString(),
  };
  orders.push(order);
  return order;
}

// 25 sample orders, so there's something to paginate. The oldest ones are already shipped; the
// ones in the middle, paid; the newest ones, pending. One every 7 hours from October 1st.
const FIRST_ORDER = new Date('2026-10-01T09:00:00Z').getTime();
const SEVEN_HOURS = 7 * 60 * 60 * 1000;
for (let number = 1; number <= 25; number++) {
  const createdAt = new Date(FIRST_ORDER + (number - 1) * SEVEN_HOURS);
  const order = createOrder((number % 3) + 1, (number % 4) + 1, createdAt);
  if (number <= 12) order.status = 'shipped';
  else if (number <= 20) order.status = 'paid';
}

// From newest to oldest: the highest id is the last one created. toSorted sorts a copy; the
// original list doesn't change.
export function ordersNewestFirst(): Order[] {
  return orders.toSorted((a, b) => b.id - a.id);
}
