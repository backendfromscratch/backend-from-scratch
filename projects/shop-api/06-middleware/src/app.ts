// The API from lesson 5, with three middleware: a request log, CORS and a route only for the admin.
// #region imports
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createOrder, createProduct, findOrder, findProduct, orders, products } from './data.ts';
import { adminOnly } from './middleware/admin-only.ts';
import { requestLog } from './middleware/request-log.ts';
// #endregion imports

export const app = new Hono();

// #region middleware
// Order matters: each request goes through the layers in the order they're added.
app.use(requestLog);
app.use(cors({ origin: 'https://shop.example' }));
// #endregion middleware

// #region routes
app.get('/', (c) => c.text("Ana and Luis's shop. Try /products and /orders.\n"));

// ?max=25: only the products that cost that much at most.
app.get('/products', (c) => {
  const max = c.req.query('max');
  if (max === undefined) return c.json(products);
  return c.json(products.filter((product) => product.price <= Number(max)));
});

// :id is a route parameter: /products/2 leaves it in c.req.param('id').
app.get('/products/:id', (c) => {
  const product = findProduct(Number(c.req.param('id')));
  if (!product) return c.json({ error: 'No such product' }, 404);
  return c.json(product);
});

app.get('/orders', (c) => c.json(orders));

app.get('/orders/:id', (c) => {
  const order = findOrder(Number(c.req.param('id')));
  if (!order) return c.json({ error: 'No such order' }, 404);
  return c.json(order);
});
// #endregion routes

// #region new-product
// adminOnly goes before the route's function: without the token, the route doesn't even run.
app.post('/products', adminOnly, async (c) => {
  const data: { name: string; price: number } = await c.req.json();
  const product = createProduct(data.name, data.price);
  return c.json(product, 201, { Location: `/products/${product.id}` });
});
// #endregion new-product

// #region new-order
app.post('/orders', async (c) => {
  let data: { productId: number; quantity: number };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'The body is not valid JSON' }, 400);
  }
  if (!findProduct(data.productId)) {
    return c.json({ error: 'No such product' }, 422);
  }
  const order = createOrder(data.productId, data.quantity);
  return c.json(order, 201, { Location: `/orders/${order.id}` });
});
// #endregion new-order

// #region not-allowed
// Hono answers 404 to a method that a route doesn't have. To answer 405 with Allow, as in
// lesson 4, you add a route for the other methods, after the rest.
app.all('/products', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' }));
app.all('/products/:id', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));
app.all('/orders', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' }));
app.all('/orders/:id', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));
// #endregion not-allowed
