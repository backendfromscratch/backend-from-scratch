// The API for Phase 4, lesson 2: every error, with the same shape across the whole API (Problem
// Details, RFC 9457), so that a client can handle them all the same way.
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import {
  createOrder,
  createProduct,
  deleteProduct,
  findOrder,
  findProduct,
  orders,
  products,
} from './data.ts';
import { log } from './log.ts';
import { adminOnly } from './middleware/admin-only.ts';
import { requestLog } from './middleware/request-log.ts';
import { validate } from './middleware/validate.ts';
import { httpProblem, invalidData, problem, problemType } from './problems.ts';
import {
  filterSchema,
  idSchema,
  orderChangeSchema,
  orderSchema,
  productSchema,
} from './schemas.ts';

export const app = new Hono();

// requestId gives each request an identifier and returns it in the X-Request-Id header.
app.use(requestId());
app.use(requestLog);
app.use(cors({ origin: 'https://shop.example' }));

app.get('/', (c) => c.text("Ana and Luis's shop. Try /products and /orders.\n"));

// #region products
app.get('/products', validate('query', filterSchema), (c) => {
  const { max } = c.req.valid('query');
  if (max === undefined) return c.json(products);
  return c.json(products.filter((product) => product.price <= max));
});

app.get('/products/:id', validate('param', idSchema), (c) => {
  const product = findProduct(c.req.valid('param').id);
  if (!product) return httpProblem(c, 404, 'No such product');
  return c.json(product);
});

// Create: POST to the collection. It answers 201 and, in Location, the new product's URL.
app.post('/products', adminOnly, validate('json', productSchema), (c) => {
  const { name, price } = c.req.valid('json');
  const product = createProduct(name, price);
  return c.json(product, 201, { Location: `/products/${product.id}` });
});

// Delete: DELETE to the product. If it works, there's nothing to tell: 204, without a body.
app.delete('/products/:id', adminOnly, validate('param', idSchema), (c) => {
  if (!deleteProduct(c.req.valid('param').id)) {
    return httpProblem(c, 404, 'No such product');
  }
  return c.body(null, 204);
});
// #endregion products

// #region orders
app.get('/orders', (c) => c.json(orders));

app.get('/orders/:id', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  return c.json(order);
});

// A product that doesn't exist is invalid data: the same 422 as validation, with the field.
app.post('/orders', validate('json', orderSchema), (c) => {
  const { productId, quantity } = c.req.valid('json');
  if (!findProduct(productId)) {
    return invalidData(c, [{ field: 'productId', problem: 'No such product' }]);
  }
  const order = createOrder(productId, quantity);
  return c.json(order, 201, { Location: `/orders/${order.id}` });
});
// #endregion orders

// #region conflict
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
// #endregion conflict

// #region change-order
app.patch('/orders/:id', validate('param', idSchema), validate('json', orderChangeSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status !== 'pending') {
    return statusDoesNotAllow(c, `The order is ${order.status}: it can no longer be changed`);
  }
  order.quantity = c.req.valid('json').quantity;
  return c.json(order);
});
// #endregion change-order

// #region cancel
app.post('/orders/:id/cancellation', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status === 'shipped') {
    return statusDoesNotAllow(c, 'The order is already shipped: it cannot be cancelled');
  }
  order.status = 'cancelled';
  return c.json(order);
});
// #endregion cancel

// #region not-allowed
// A method the route doesn't have: 405, and in Allow, the ones it does have.
const notAllowed = (c: Context, allowed: string) =>
  httpProblem(c, 405, `This route does not accept ${c.req.method}`, { Allow: allowed });

app.all('/products', (c) => notAllowed(c, 'GET, POST'));
app.all('/products/:id', (c) => notAllowed(c, 'GET, DELETE'));
app.all('/orders', (c) => notAllowed(c, 'GET, POST'));
app.all('/orders/:id', (c) => notAllowed(c, 'GET, PATCH'));
app.all('/orders/:id/cancellation', (c) => notAllowed(c, 'POST'));
// #endregion not-allowed

// #region errors
// What doesn't exist: a 404 with the same shape as the rest of the errors.
app.notFound((c) => httpProblem(c, 404, 'No such route'));

// Any error that escapes from a route ends up here.
app.onError((error, c) => {
  // The errors Hono throws already carry their status code (malformed JSON is a 400).
  if (error instanceof HTTPException) {
    return httpProblem(c, error.status, 'The request cannot be read');
  }
  const id = c.get('requestId');
  // The stack trace goes to the log. The client gets nothing about how the server is built: only
  // that it failed and, in instance, the request id, to find it in the log if they report it.
  log.error({ err: error, requestId: id }, 'uncaught error');
  return problem(c, {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'Something failed on the server. If it happens again, tell us the value of instance.',
    instance: `urn:uuid:${id}`,
  });
});
// #endregion errors
