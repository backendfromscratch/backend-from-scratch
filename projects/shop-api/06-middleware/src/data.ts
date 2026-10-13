// The shop's data, in memory: it's lost when the server stops. The database arrives in
// Phase 5.
export interface Product {
  id: number;
  name: string;
  price: number;
}

export type OrderStatus = 'pending' | 'paid' | 'shipped';

export interface Order {
  id: number;
  productId: number;
  quantity: number;
  status: OrderStatus;
}

export const products: Product[] = [
  { id: 1, name: 'T-shirt', price: 20 },
  { id: 2, name: 'Mug', price: 8.5 },
  { id: 3, name: 'Hoodie', price: 35 },
];

export const orders: Order[] = [];

export function findProduct(id: number): Product | undefined {
  return products.find((product) => product.id === id);
}

// #region create-product
export function createProduct(name: string, price: number): Product {
  const product: Product = { id: products.length + 1, name, price };
  products.push(product);
  return product;
}
// #endregion create-product

export function findOrder(id: number): Order | undefined {
  return orders.find((order) => order.id === id);
}

export function createOrder(productId: number, quantity: number): Order {
  const order: Order = { id: orders.length + 1, productId, quantity, status: 'pending' };
  orders.push(order);
  return order;
}
