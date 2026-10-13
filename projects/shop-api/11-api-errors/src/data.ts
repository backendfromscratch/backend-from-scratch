// The shop's data, in memory: it's lost when the server stops. The database arrives in
// Phase 5.
export interface Product {
  id: number;
  name: string;
  price: number;
}

// #region status
// A cancelled order isn't deleted: it's still there, with its status, so it can be looked up later.
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

export interface Order {
  id: number;
  productId: number;
  quantity: number;
  status: OrderStatus;
}
// #endregion status

export const products: Product[] = [
  { id: 1, name: 'T-shirt', price: 20 },
  { id: 2, name: 'Mug', price: 8.5 },
  { id: 3, name: 'Hoodie', price: 35 },
];

export const orders: Order[] = [];

export function findProduct(id: number): Product | undefined {
  return products.find((product) => product.id === id);
}

// #region delete-product
// The id can no longer be "how many there are + 1": if 2 is deleted from [1, 2, 3], two are left,
// and the next one would be 3 again. A counter that only goes up never repeats an id.
let lastProductId = products.length;

export function createProduct(name: string, price: number): Product {
  lastProductId = lastProductId + 1;
  const product: Product = { id: lastProductId, name, price };
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
// #endregion delete-product

export function findOrder(id: number): Order | undefined {
  return orders.find((order) => order.id === id);
}

export function createOrder(productId: number, quantity: number): Order {
  const order: Order = { id: orders.length + 1, productId, quantity, status: 'pending' };
  orders.push(order);
  return order;
}
