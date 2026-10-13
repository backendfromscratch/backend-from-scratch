// The shop's data, in memory: it's lost when the server stops. The database arrives in
// Phase 5.
// #region product
// From version 2, the price is in whole cents: 850, not 8.5. With decimals, money calculations end
// up off by a cent (lesson 6).
export interface Product {
  id: number;
  name: string;
  priceCents: number;
}
// #endregion product

// A cancelled order isn't deleted: it's still there, with its status, so it can be looked up later.
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

export interface Order {
  id: number;
  productId: number;
  quantity: number;
  status: OrderStatus;
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

export function findOrder(id: number): Order | undefined {
  return orders.find((order) => order.id === id);
}

export function createOrder(productId: number, quantity: number): Order {
  const order: Order = { id: orders.length + 1, productId, quantity, status: 'pending' };
  orders.push(order);
  return order;
}

// 25 sample orders, so there's something to paginate. The oldest ones are already shipped; the
// ones in the middle, paid; the newest ones, pending.
for (let number = 1; number <= 25; number++) {
  const order = createOrder((number % 3) + 1, (number % 4) + 1);
  if (number <= 12) order.status = 'shipped';
  else if (number <= 20) order.status = 'paid';
}

// From newest to oldest: the highest id is the last one created. toSorted sorts a copy; the
// original list doesn't change.
export function ordersNewestFirst(): Order[] {
  return orders.toSorted((a, b) => b.id - a.id);
}
