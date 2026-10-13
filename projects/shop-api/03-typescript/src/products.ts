// #region product
// Types say what shape each piece of data has. Node erases them when it runs the code: they're
// there so the editor and tsc warn you about errors before the program ever runs.
export interface Product {
  id: number;
  name: string;
  price: number;
}
// #endregion product

// #region order
// An order can only be in one of these three states.
export type OrderStatus = 'pending' | 'paid' | 'shipped';

export interface Order {
  id: number;
  productId: number;
  quantity: number;
  status: OrderStatus;
}
// #endregion order

// #region functions
export const products: Product[] = [
  { id: 1, name: 'T-shirt', price: 20 },
  { id: 2, name: 'Mug', price: 8.5 },
  { id: 3, name: 'Hoodie', price: 35 },
];

// Returns the product with that id, or undefined if there isn't one: the type makes you handle it.
export function findProduct(id: number): Product | undefined {
  return products.find((product) => product.id === id);
}

export function total(product: Product, quantity: number): number {
  return product.price * quantity;
}
// #endregion functions
