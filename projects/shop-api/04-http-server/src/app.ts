// The server, without a framework: just the node:http module that comes with Node.js.
// #region imports
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createOrder, findOrder, findProduct, orders, products } from './data.ts';
// #endregion imports

// #region respond
function sendJson(res: ServerResponse, status: number, data: unknown, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}

function methodNotAllowed(res: ServerResponse, allowed: string) {
  sendJson(res, 405, { error: 'Method not allowed' }, { Allow: allowed });
}
// #endregion respond

// #region read-body
// The body arrives in chunks (it's a stream): they're all put together before reading it.
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
// #endregion read-body

// #region routes
// #region routes-start
async function handle(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("Ana and Luis's shop. Try /products and /orders.\n");
    return;
  }

  if (pathname === '/products') {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    return sendJson(res, 200, products);
  }
  // #endregion routes-start

  // #region routes-end
  // #region routes-product
  const route = pathname.match(/^\/products\/(\d+)$/);
  if (route) {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    const product = findProduct(Number(route[1]));
    if (!product) return sendJson(res, 404, { error: 'No such product' });
    return sendJson(res, 200, product);
  }
  // #endregion routes-product

  // #region routes-orders
  if (pathname === '/orders') {
    if (req.method === 'GET') return sendJson(res, 200, orders);
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET, POST');
    return newOrder(req, res);
  }

  const orderRoute = pathname.match(/^\/orders\/(\d+)$/);
  if (orderRoute) {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    const order = findOrder(Number(orderRoute[1]));
    if (!order) return sendJson(res, 404, { error: 'No such order' });
    return sendJson(res, 200, order);
  }

  sendJson(res, 404, { error: 'No such route' });
}
// #endregion routes-orders
// #endregion routes-end
// #endregion routes

// #region new-order
async function newOrder(req: IncomingMessage, res: ServerResponse) {
  let data: { productId: number; quantity: number };
  try {
    // "as" promises TypeScript a shape that nobody has checked: lesson 7 fixes that.
    data = JSON.parse(await readBody(req)) as { productId: number; quantity: number };
  } catch {
    return sendJson(res, 400, { error: 'The body is not valid JSON' });
  }
  // The JSON was read, but it asks for something that doesn't exist: 422 (Phase 2, lesson 3).
  if (!findProduct(data.productId)) {
    return sendJson(res, 422, { error: 'No such product' });
  }
  const order = createOrder(data.productId, data.quantity);
  sendJson(res, 201, order, { Location: `/orders/${order.id}` });
}
// #endregion new-order

// #region create-server
export function createShopServer() {
  return createServer((req, res) => {
    handle(req, res).catch(() => sendJson(res, 500, { error: 'Internal server error' }));
  });
}
// #endregion create-server
