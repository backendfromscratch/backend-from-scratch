// Version 2 of the API: prices in whole cents (priceCents). Each route comes from its definition
// in the contract (contract.ts): OpenAPIHono validates the request with its schemas and writes the
// route down in the documentation.
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import * as contract from './contract.ts';
import {
  createOrder,
  createProduct,
  deleteProduct,
  findOrder,
  findProduct,
  ordersNewestFirst,
  processedEvents,
  products,
} from './data.ts';
import { ifInvalid } from './middleware/validate.ts';
import { nextLink, pageByCursor, pageByOffset } from './pagination.ts';
import { httpProblem, invalidData, problem, problemType } from './problems.ts';

// defaultHook: what's answered if the request doesn't match the schema. The same 422 as always.
export const v2 = new OpenAPIHono({ defaultHook: ifInvalid });

// How the token is sent, for the documentation: Authorization: Bearer <token>.
v2.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
});

v2.openapi(contract.listProducts, (c) => {
  const { maxCents, sort } = c.req.valid('query');
  let list = products;
  if (maxCents !== undefined) {
    list = list.filter((product) => product.priceCents <= maxCents);
  }
  // toSorted sorts a copy: the original list's order doesn't change.
  if (sort === 'price') list = list.toSorted((a, b) => a.priceCents - b.priceCents);
  if (sort === '-price') list = list.toSorted((a, b) => b.priceCents - a.priceCents);
  return c.json(list, 200);
});

// TypeScript checks each response against the contract: a 404 that wasn't in it, or a c.json
// without the status code, wouldn't compile.
v2.openapi(contract.getProduct, (c) => {
  const product = findProduct(c.req.valid('param').id);
  if (!product) return httpProblem(c, 404, 'No such product');
  return c.json(product, 200);
});

v2.openapi(contract.createProduct, (c) => {
  const { name, priceCents } = c.req.valid('json');
  const product = createProduct(name, priceCents);
  return c.json(product, 201, { Location: `${c.req.path}/${product.id}` });
});

v2.openapi(contract.deleteProduct, (c) => {
  if (!deleteProduct(c.req.valid('param').id)) {
    return httpProblem(c, 404, 'No such product');
  }
  return c.body(null, 204);
});

// A page of orders, from newest to oldest. If there are more, the Link header says where the next
// one is. ?offset= stays to compare the two ways of paginating.
v2.openapi(contract.listOrders, (c) => {
  const { limit, cursor, offset, status } = c.req.valid('query');
  let list = ordersNewestFirst();
  if (status !== undefined) list = list.filter((order) => order.status === status);

  if (offset !== undefined) {
    const { page, next } = pageByOffset(list, limit, offset);
    if (next !== undefined) {
      c.header('Link', nextLink(c.req.url, 'offset', String(next)));
    }
    return c.json(page, 200);
  }

  const { page, next } = pageByCursor(list, limit, cursor);
  if (next !== undefined) c.header('Link', nextLink(c.req.url, 'cursor', next));
  return c.json(page, 200);
});

v2.openapi(contract.getOrder, (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  return c.json(order, 200);
});

// A product that doesn't exist is invalid data: the same 422 as validation, with the field.
v2.openapi(contract.createOrder, (c) => {
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

v2.openapi(contract.changeOrder, (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status !== 'pending') {
    return statusDoesNotAllow(c, `The order is ${order.status}: it can no longer be changed`);
  }
  order.quantity = c.req.valid('json').quantity;
  return c.json(order, 200);
});

v2.openapi(contract.cancelOrder, (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status === 'shipped') {
    return statusDoesNotAllow(c, 'The order is already shipped: it cannot be cancelled');
  }
  order.status = 'cancelled';
  return c.json(order, 200);
});

// #region receive-payment
// By the time it gets here, the signature is already checked and the event matches its schema.
// The response has to be quick: if the gateway doesn't get a 2xx in time, it retries. That's why,
// if the work were long (an email, an invoice), it would be left for later (a queue, Phase 9).
v2.openapi(contract.receivePayment, (c) => {
  const event = c.req.valid('json');
  // The same event again: receipt is acknowledged and nothing else is done.
  if (processedEvents.has(event.id)) {
    return c.json({ received: event.id, repeated: true }, 200);
  }
  const order = findOrder(event.orderId);
  if (!order) {
    return invalidData(c, [{ field: 'orderId', problem: 'No such order' }]);
  }
  processedEvents.add(event.id);
  // Only a pending order becomes paid: a cancelled one stays cancelled.
  if (order.status === 'pending') order.status = 'paid';
  return c.json({ received: event.id, repeated: false }, 200);
});
// #endregion receive-payment

// A method the route doesn't have: 405, and in Allow, the ones it does have.
const notAllowed = (c: Context, allowed: string) =>
  httpProblem(c, 405, `This route does not accept ${c.req.method}`, { Allow: allowed });

v2.all('/products', (c) => notAllowed(c, 'GET, POST'));
v2.all('/products/:id', (c) => notAllowed(c, 'GET, DELETE'));
v2.all('/orders', (c) => notAllowed(c, 'GET, POST'));
v2.all('/orders/:id', (c) => notAllowed(c, 'GET, PATCH'));
v2.all('/orders/:id/cancellation', (c) => notAllowed(c, 'POST'));
v2.all('/webhooks/payments', (c) => notAllowed(c, 'POST'));
