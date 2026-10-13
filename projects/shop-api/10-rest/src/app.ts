// The API for Phase 4, lesson 1: the resources (products and orders) and what can be done with
// each one, with the right method and status code. Without Phase 3's test routes: a public API
// wouldn't have them.
import { Hono } from 'hono';
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
  if (!product) return c.json({ error: 'No such product' }, 404);
  return c.json(product);
});

// Create: POST to the collection. It answers 201 and, in Location, the new product's URL.
app.post('/products', adminOnly, validate('json', productSchema), (c) => {
  const { name, price } = c.req.valid('json');
  const product = createProduct(name, price);
  return c.json(product, 201, { Location: `/products/${product.id}` });
});
// #endregion products

// #region delete
// Delete: DELETE to the product. If it works, there's nothing to tell: 204, without a body.
app.delete('/products/:id', adminOnly, validate('param', idSchema), (c) => {
  if (!deleteProduct(c.req.valid('param').id)) {
    return c.json({ error: 'No such product' }, 404);
  }
  return c.body(null, 204);
});
// #endregion delete

// #region orders
app.get('/orders', (c) => c.json(orders));

app.get('/orders/:id', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return c.json({ error: 'No such order' }, 404);
  return c.json(order);
});

// When the route runs, the data already matches the schema: c.req.valid('json') has its type.
app.post('/orders', validate('json', orderSchema), (c) => {
  const { productId, quantity } = c.req.valid('json');
  // It matches the schema, but asks for a product that doesn't exist: 422, like invalid data.
  if (!findProduct(productId)) return c.json({ error: 'No such product' }, 422);
  const order = createOrder(productId, quantity);
  return c.json(order, 201, { Location: `/orders/${order.id}` });
});
// #endregion orders

// #region change-order
// Change one part: PATCH to the order, with only what changes. If the order is already paid, the
// request is well written, but it clashes with the resource's state: 409 Conflict.
app.patch('/orders/:id', validate('param', idSchema), validate('json', orderChangeSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return c.json({ error: 'No such order' }, 404);
  if (order.status !== 'pending') {
    return c.json({ error: `The order is ${order.status}: it can no longer be changed` }, 409);
  }
  order.quantity = c.req.valid('json').quantity;
  return c.json(order);
});
// #endregion change-order

// #region cancel
// An action that isn't create, read, change or delete: it becomes a resource, "the order's
// cancellation", and it's created with POST. Cancelling twice leaves the order the same: cancelled.
app.post('/orders/:id/cancellation', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return c.json({ error: 'No such order' }, 404);
  if (order.status === 'shipped') {
    return c.json({ error: 'The order is already shipped: it cannot be cancelled' }, 409);
  }
  order.status = 'cancelled';
  return c.json(order);
});
// #endregion cancel

// #region not-allowed
// A method the route doesn't have: 405, and in Allow, the ones it does have.
const notAllowed = { error: 'Method not allowed' };
app.all('/products', (c) => c.json(notAllowed, 405, { Allow: 'GET, POST' }));
app.all('/products/:id', (c) => c.json(notAllowed, 405, { Allow: 'GET, DELETE' }));
app.all('/orders', (c) => c.json(notAllowed, 405, { Allow: 'GET, POST' }));
app.all('/orders/:id', (c) => c.json(notAllowed, 405, { Allow: 'GET, PATCH' }));
app.all('/orders/:id/cancellation', (c) => c.json(notAllowed, 405, { Allow: 'POST' }));
// #endregion not-allowed

// #region errors
// What doesn't exist: a 404 in JSON, like the rest of the API.
app.notFound((c) => c.json({ error: 'No such route' }, 404));

// Any error that escapes from a route ends up here.
app.onError((error, c) => {
  // The errors Hono throws already carry their status code (malformed JSON is a 400): they're
  // answered in JSON, like the rest of the API.
  if (error instanceof HTTPException) {
    return c.json({ error: 'The request cannot be read', detail: error.message }, error.status);
  }
  const id = c.get('requestId');
  // The error and its stack trace go to the log; the client gets a message and the id to find it.
  log.error({ err: error, requestId: id }, 'uncaught error');
  return c.json({ error: 'Internal server error', requestId: id }, 500);
});
// #endregion errors
