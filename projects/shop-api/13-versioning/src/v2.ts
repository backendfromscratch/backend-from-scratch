// Version 2 of the API: prices in whole cents (priceCents). It's the current version; version 1
// (v1.ts) only translates what changed.
import { type Context, Hono } from 'hono';
import {
  createOrder,
  createProduct,
  deleteProduct,
  findOrder,
  findProduct,
  ordersNewestFirst,
  products,
} from './data.ts';
import { adminOnly } from './middleware/admin-only.ts';
import { validate } from './middleware/validate.ts';
import { nextLink, pageByCursor, pageByOffset } from './pagination.ts';
import { httpProblem, invalidData, problem, problemType } from './problems.ts';
import {
  filterSchema,
  idSchema,
  orderChangeSchema,
  orderListSchema,
  orderSchema,
  productSchema,
} from './schemas.ts';

// #region list-products
export const v2 = new Hono();

v2.get('/products', validate('query', filterSchema), (c) => {
  const { maxCents, sort } = c.req.valid('query');
  let list = products;
  if (maxCents !== undefined) {
    list = list.filter((product) => product.priceCents <= maxCents);
  }
  // toSorted sorts a copy: the original list's order doesn't change.
  if (sort === 'price') list = list.toSorted((a, b) => a.priceCents - b.priceCents);
  if (sort === '-price') list = list.toSorted((a, b) => b.priceCents - a.priceCents);
  return c.json(list);
});
// #endregion list-products

v2.get('/products/:id', validate('param', idSchema), (c) => {
  const product = findProduct(c.req.valid('param').id);
  if (!product) return httpProblem(c, 404, 'No such product');
  return c.json(product);
});

// #region create-product
// Create: POST to the collection. Location is built from the request's path (/v2/products), so it
// works the same in any version.
v2.post('/products', adminOnly, validate('json', productSchema), (c) => {
  const { name, priceCents } = c.req.valid('json');
  const product = createProduct(name, priceCents);
  return c.json(product, 201, { Location: `${c.req.path}/${product.id}` });
});
// #endregion create-product

// Delete: DELETE to the product. If it works, there's nothing to tell: 204, without a body.
v2.delete('/products/:id', adminOnly, validate('param', idSchema), (c) => {
  if (!deleteProduct(c.req.valid('param').id)) {
    return httpProblem(c, 404, 'No such product');
  }
  return c.body(null, 204);
});

// A page of orders, from newest to oldest. If there are more, the Link header says where the next
// one is. ?offset= stays to compare the two ways of paginating.
v2.get('/orders', validate('query', orderListSchema), (c) => {
  const { limit, cursor, offset, status } = c.req.valid('query');
  let list = ordersNewestFirst();
  if (status !== undefined) list = list.filter((order) => order.status === status);

  if (offset !== undefined) {
    const { page, next } = pageByOffset(list, limit, offset);
    if (next !== undefined) {
      c.header('Link', nextLink(c.req.url, 'offset', String(next)));
    }
    return c.json(page);
  }

  const { page, next } = pageByCursor(list, limit, cursor);
  if (next !== undefined) c.header('Link', nextLink(c.req.url, 'cursor', next));
  return c.json(page);
});

v2.get('/orders/:id', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  return c.json(order);
});

// A product that doesn't exist is invalid data: the same 422 as validation, with the field.
v2.post('/orders', validate('json', orderSchema), (c) => {
  const { productId, quantity } = c.req.valid('json');
  if (!findProduct(productId)) {
    return invalidData(c, [{ field: 'productId', problem: 'No such product' }]);
  }
  const order = createOrder(productId, quantity);
  return c.json(order, 201, { Location: `${c.req.path}/${order.id}` });
});

// A type of the shop's own: the request is well written, but the order's status doesn't allow it.
// title is always the same; detail says what's going on with this order.
function statusDoesNotAllow(c: Context, detail: string) {
  return problem(c, {
    type: problemType('order-status'),
    title: "The order's status doesn't allow it",
    status: 409,
    detail,
  });
}

v2.patch('/orders/:id', validate('param', idSchema), validate('json', orderChangeSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status !== 'pending') {
    return statusDoesNotAllow(c, `The order is ${order.status}: it can no longer be changed`);
  }
  order.quantity = c.req.valid('json').quantity;
  return c.json(order);
});

v2.post('/orders/:id/cancellation', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status === 'shipped') {
    return statusDoesNotAllow(c, 'The order is already shipped: it cannot be cancelled');
  }
  order.status = 'cancelled';
  return c.json(order);
});

// A method the route doesn't have: 405, and in Allow, the ones it does have.
const notAllowed = (c: Context, allowed: string) =>
  httpProblem(c, 405, `This route does not accept ${c.req.method}`, { Allow: allowed });

v2.all('/products', (c) => notAllowed(c, 'GET, POST'));
v2.all('/products/:id', (c) => notAllowed(c, 'GET, DELETE'));
v2.all('/orders', (c) => notAllowed(c, 'GET, POST'));
v2.all('/orders/:id', (c) => notAllowed(c, 'GET, PATCH'));
v2.all('/orders/:id/cancellation', (c) => notAllowed(c, 'POST'));
