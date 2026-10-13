// #region find
import { findProduct, total, type Order } from './products.ts';

const order: Order = { id: 1, productId: 2, quantity: 3, status: 'pending' };
const product = findProduct(order.productId);

if (product === undefined) {
  console.log(`There's no product ${order.productId}`);
} else {
  console.log(
    `Order ${order.id}: ${order.quantity} × ${product.name} = ${total(product, order.quantity)} €`,
  );
}
// #endregion find

// #region from-outside
// What comes from outside (a JSON, a request) is unknown: you have to check it before using it.
const data: unknown = JSON.parse('{"id":4,"name":"Cap","price":15}');
if (typeof data === 'object' && data !== null && 'name' in data) {
  console.log(`A product has arrived: ${String(data.name)}`);
}
// #endregion from-outside
