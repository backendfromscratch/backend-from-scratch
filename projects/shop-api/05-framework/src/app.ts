// The same API as in lesson 4, now with Hono.
// #region create-app
import { Hono } from 'hono';
import { createOrder, findOrder, findProduct, orders, products } from './data.ts';

export const app = new Hono();
// #endregion create-app

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
app.all('/products', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));
app.all('/products/:id', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));
app.all('/orders', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' }));
app.all('/orders/:id', (c) => c.json({ error: 'Method not allowed' }, 405, { Allow: 'GET' }));
// #endregion not-allowed
