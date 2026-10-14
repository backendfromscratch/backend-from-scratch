// Version 2 of the API: prices in whole cents (priceCents). Each route comes from its definition
// in the contract (contract.ts): OpenAPIHono validates the request with its schemas and writes the
// route down in the documentation.
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as contract from './contract.ts';
import {
  changeQuantity,
  changeStatus,
  createOrder,
  createProduct,
  deleteProduct,
  findOrder,
  findProduct,
  listProducts,
  orderChanges,
  recordEvent,
  type Order,
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

// PostgreSQL already does the filter and the sort (data.ts): it only returns the products that match.
v2.openapi(contract.listProducts, async (c) => {
  return c.json(await listProducts(c.req.valid('query')), 200);
});

// TypeScript checks each response against the contract: a 404 that wasn't in it, or a c.json
// without the status code, wouldn't compile.
v2.openapi(contract.getProduct, async (c) => {
  const product = await findProduct(c.req.valid('param').id);
  if (!product) return httpProblem(c, 404, 'No such product');
  return c.json(product, 200);
});

v2.openapi(contract.createProduct, async (c) => {
  const { name, priceCents } = c.req.valid('json');
  const product = await createProduct(name, priceCents);
  return c.json(product, 201, { Location: `${c.req.path}/${product.id}` });
});

// If the product has orders, deleteProduct throws a PostgreSQL error and onError (app.ts)
// answers a 409.
v2.openapi(contract.deleteProduct, async (c) => {
  if (!(await deleteProduct(c.req.valid('param').id))) {
    return httpProblem(c, 404, 'No such product');
  }
  return c.body(null, 204);
});

// A page of orders, from newest to oldest. If there are more, the Link header says where the next
// one is. ?offset= stays to compare the two ways of paginating.
v2.openapi(contract.listOrders, async (c) => {
  const { limit, cursor, offset, status } = c.req.valid('query');

  if (offset !== undefined) {
    const { page, next } = await pageByOffset(limit, offset, status);
    if (next !== undefined) {
      c.header('Link', nextLink(c.req.url, 'offset', String(next)));
    }
    return c.json(page, 200);
  }

  const { page, next } = await pageByCursor(limit, cursor, status);
  if (next !== undefined) c.header('Link', nextLink(c.req.url, 'cursor', next));
  return c.json(page, 200);
});

v2.openapi(contract.getOrder, async (c) => {
  const order = await findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  return c.json(order, 200);
});

// A product that doesn't exist is invalid data: the same 422 as validation, with the field.
v2.openapi(contract.createOrder, async (c) => {
  const { productId, quantity } = c.req.valid('json');
  if (!(await findProduct(productId))) {
    return invalidData(c, [{ field: 'productId', problem: 'No such product' }]);
  }
  const order = await createOrder(productId, quantity);
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

v2.openapi(contract.changeOrder, async (c) => {
  const order = await findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status !== 'pending') {
    return statusDoesNotAllow(c, `The order is ${order.status}: it can no longer be changed`);
  }
  return c.json(await changeQuantity(order.id, c.req.valid('json').quantity), 200);
});

v2.openapi(contract.cancelOrder, async (c) => {
  const order = await findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status === 'shipped') {
    return statusDoesNotAllow(c, 'The order is already shipped: it cannot be cancelled');
  }
  return c.json(await changeStatus(order.id, 'cancelled'), 200);
});

// By the time it gets here, the signature is already checked and the event matches its schema.
// The response has to be quick: if the gateway doesn't get a 2xx in time, it retries. That's why,
// if the work were long (an email, an invoice), it would be left for later (a queue, Phase 9).
v2.openapi(contract.receivePayment, async (c) => {
  const event = c.req.valid('json');
  const order = await findOrder(event.orderId);
  if (!order) {
    return invalidData(c, [{ field: 'orderId', problem: 'No such order' }]);
  }
  // The same event again: receipt is acknowledged and nothing else is done.
  if (!(await recordEvent(event.id))) {
    return c.json({ received: event.id, repeated: true }, 200);
  }
  // Only a pending order becomes paid: a cancelled one stays cancelled.
  if (order.status === 'pending') await changeStatus(order.id, 'paid');
  return c.json({ received: event.id, repeated: false }, 200);
});

// #region follow-order
// The response starts and doesn't end: each event is one more piece of the same response. First,
// the current status; after that, each change. If the connection drops, EventSource reconnects on
// its own and gets the current status again: nothing is lost.
v2.openapi(contract.followOrder, async (c) => {
  const order = await findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'status', data: JSON.stringify(order) });
    const notify = async (changed: Order) => {
      if (changed.id !== order.id) return;
      await stream.writeSSE({ event: 'status', data: JSON.stringify(changed) });
    };
    orderChanges.on('change', notify);
    // It waits until the client leaves; then it stops listening.
    await new Promise<void>((left) => stream.onAbort(left));
    orderChanges.off('change', notify);
  });
});
// #endregion follow-order

// A method the route doesn't have: 405, and in Allow, the ones it does have.
const notAllowed = (c: Context, allowed: string) =>
  httpProblem(c, 405, `This route does not accept ${c.req.method}`, { Allow: allowed });

v2.all('/products', (c) => notAllowed(c, 'GET, POST'));
v2.all('/products/:id', (c) => notAllowed(c, 'GET, DELETE'));
v2.all('/orders', (c) => notAllowed(c, 'GET, POST'));
v2.all('/orders/:id', (c) => notAllowed(c, 'GET, PATCH'));
v2.all('/orders/:id/cancellation', (c) => notAllowed(c, 'POST'));
v2.all('/orders/:id/events', (c) => notAllowed(c, 'GET'));
v2.all('/webhooks/payments', (c) => notAllowed(c, 'POST'));
