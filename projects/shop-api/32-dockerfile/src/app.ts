// The API for Phase 6, lesson 8: accounts, sessions, API keys, signing in with an identity
// provider, roles and permissions (permissions.ts), an HTML page of the shop (/shop) with the
// security headers, the origin check against CSRF, the notifications to the delivery company
// checked against SSRF (safe-url.ts), and limits on the attempts to sign in and to create
// accounts (rate-limits.ts). GET /v2/orders/:id/events sends each change to an order (Server-Sent
// Events), and /echo is an echo over WebSocket.
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { echo } from './echo.ts';
import type { Env } from './env.ts';
import { log } from './log.ts';
import { loadApiKey } from './middleware/api-key.ts';
import { requestLog } from './middleware/request-log.ts';
import { checkOrigin, loadSession } from './middleware/session.ts';
import { dbConflict, httpProblem, problem } from './problems.ts';
import { shop } from './shop.ts';
import { SUNSET, v1 } from './v1.ts';
import { v2 } from './v2.ts';

export const app = new Hono<Env>();

// requestId gives each request an identifier and returns it in the X-Request-Id header.
app.use(requestId());
app.use(requestLog);
app.use(cors({ origin: 'https://shop.example' }));
// #region security-headers
// The security headers, on every response: X-Content-Type-Options: nosniff (the browser doesn't
// guess the type: a JSON isn't run as a script), X-Frame-Options (another site doesn't put these
// pages in an iframe), Referrer-Policy, Strict-Transport-Security (only HTTPS, when there is)…
// The Content Security Policy goes only on /shop (shop.ts): /docs loads its code from a CDN.
app.use(secureHeaders());
// #endregion security-headers
// A request with the session cookie that comes from another site: 403 (CSRF, lesson 7).
app.use(checkOrigin);
// If the request brings a session or an API key, who it is (c.var.user or c.var.apiKey), for
// every route.
app.use(loadSession);
app.use(loadApiKey);

// Each version, under its prefix: /v1/products and /v2/products.
app.route('/v1', v1);
app.route('/v2', v2);
// The shop's HTML page (lesson 6).
app.route('/shop', shop);

// The root says which versions there are and the status of each one.
app.get('/', (c) =>
  c.json({
    name: "API for Ana and Luis's shop",
    versions: [
      { version: 'v2', url: '/v2', status: 'current' },
      { version: 'v1', url: '/v1', status: 'deprecated', sunset: SUNSET.toISOString() },
    ],
  }),
);

// Version 2's contract, in OpenAPI 3.1: OpenAPIHono writes it from v2's routes and schemas.
// servers says that the document's routes (/products) hang from /v2.
app.get('/v2/openapi.json', (c) =>
  c.json(
    v2.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        title: "API for Ana and Luis's shop",
        version: '2.0.0',
        description: "The shop's products and orders. Prices are in cents.",
      },
      servers: [{ url: '/v2' }],
    }),
  ),
);

// A page that reads that contract and shows it: each route, its data and a button to try it.
// The browser loads its code from a CDN: with the exact version, like the npm packages.
app.get(
  '/docs',
  Scalar({
    url: '/v2/openapi.json',
    pageTitle: 'Shop API',
    cdn: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0',
  }),
);

// #region echo
// If the request asks to switch to WebSocket, echo takes the connection. If not, the route says
// that only WebSocket is spoken here: 426 Upgrade Required.
app.get('/echo', echo, (c) =>
  httpProblem(c, 426, 'This route only speaks WebSocket', { Upgrade: 'websocket' }),
);
// #endregion echo

// #region errors
// What doesn't exist: a 404 with the same shape as the rest of the errors.
app.notFound((c) => httpProblem(c, 404, 'No such route'));

// Any error that escapes from a route ends up here.
app.onError((error, c) => {
  // The errors Hono throws already carry their status code (malformed JSON is a 400).
  if (error instanceof HTTPException) {
    // The only 403 that arrives here is checkOrigin's (middleware/session.ts).
    if (error.status === 403) {
      return httpProblem(
        c,
        403,
        'The request comes from another site and uses your session: it is not accepted',
      );
    }
    return httpProblem(c, error.status, 'The request cannot be read');
  }
  // A change that clashes with the data already there (a product with orders, when deleting it): 409.
  const conflict = dbConflict(c, error);
  if (conflict) return conflict;
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
