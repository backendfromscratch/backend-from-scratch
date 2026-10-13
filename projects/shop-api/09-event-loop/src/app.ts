// The API from lesson 8, with two slow routes to see the event loop: one that blocks it and one
// that doesn't.
// #region import-crypto
import { pbkdf2, pbkdf2Sync } from 'node:crypto';
import { promisify } from 'node:util';
// #endregion import-crypto
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { createOrder, createProduct, findOrder, findProduct, orders, products } from './data.ts';
import { log } from './log.ts';
import { adminOnly } from './middleware/admin-only.ts';
import { requestLog } from './middleware/request-log.ts';
import { validate } from './middleware/validate.ts';
import { filterSchema, idSchema, orderSchema, productSchema } from './schemas.ts';

export const app = new Hono();

// requestId gives each request an identifier and returns it in the X-Request-Id header.
app.use(requestId());
app.use(requestLog);
app.use(cors({ origin: 'https://shop.example' }));

app.get('/', (c) => c.text("Ana and Luis's shop. Try /products and /orders.\n"));

// #region routes
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

app.post('/products', adminOnly, validate('json', productSchema), (c) => {
  const { name, price } = c.req.valid('json');
  const product = createProduct(name, price);
  return c.json(product, 201, { Location: `/products/${product.id}` });
});

app.get('/orders', (c) => c.json(orders));

app.get('/orders/:id', validate('param', idSchema), (c) => {
  const order = findOrder(c.req.valid('param').id);
  if (!order) return c.json({ error: 'No such order' }, 404);
  return c.json(order);
});

// #region slow
// A calculation that's expensive on purpose: what a server does to check a password (Phase 6).
const ROUNDS = 3_000_000;
const pbkdf2Async = promisify(pbkdf2);

// Blocks: while it calculates, the event loop can't handle any other request.
app.get('/slow', (c) => {
  const start = performance.now();
  pbkdf2Sync('password', 'salt', ROUNDS, 64, 'sha512');
  return c.json({ ms: Math.round(performance.now() - start) });
});

// Doesn't block: the calculation runs on another thread, and the event loop carries on meanwhile.
app.get('/slow-async', async (c) => {
  const start = performance.now();
  await pbkdf2Async('password', 'salt', ROUNDS, 64, 'sha512');
  return c.json({ ms: Math.round(performance.now() - start) });
});
// #endregion slow

// A route that fails on purpose, to see what happens with an error nobody expected.
app.get('/error', () => {
  throw new Error('Something failed on purpose');
});

// When the route runs, the data already matches the schema: c.req.valid('json') has its type.
app.post('/orders', validate('json', orderSchema), (c) => {
  const { productId, quantity } = c.req.valid('json');
  // It matches the schema, but asks for a product that doesn't exist: 422, like invalid data.
  if (!findProduct(productId)) return c.json({ error: 'No such product' }, 422);
  const order = createOrder(productId, quantity);
  return c.json(order, 201, { Location: `/orders/${order.id}` });
});
// #endregion routes

app.all('/products', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' }));
app.all('/products/:id', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));
app.all('/orders', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' }));
app.all('/orders/:id', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));

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
