// The API for Phase 6, lesson 8: accounts, sessions, API keys, signing in with an identity
// provider, roles and permissions (permissions.ts), an HTML page of the shop (/shop) with the
// security headers, the origin check against CSRF, the notifications to the delivery company
// checked against SSRF (safe-url.ts), and limits on the attempts to sign in and to create
// accounts (rate-limits.ts). GET /v2/orders/:id/events sends each change to an order (Server-Sent
// Events), and /echo is an echo over WebSocket. In Phase 7, lesson 4, GET /health says whether the
// shop is fine, for the image's HEALTHCHECK.
import { httpInstrumentationMiddleware } from '@hono/otel';
import { trace } from '@opentelemetry/api';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { echo } from './echo.ts';
import type { Env } from './env.ts';
import { shuttingDown } from './shutdown.ts';
import { log } from './log.ts';
import { pool } from './db.ts';
import { config } from './config.ts';
import { contractDocument, validateResponses } from './contract-responses.ts';
import { loadApiKey } from './middleware/api-key.ts';
import { requestLog } from './middleware/request-log.ts';
import { checkOrigin, loadSession } from './middleware/session.ts';
import { dbConflict, httpProblem, problem } from './problems.ts';
import { checkAll } from './health.ts';
import { shop } from './shop.ts';
import { SUNSET, v1 } from './v1.ts';
import { v2 } from './v2.ts';

export const app = new Hono<Env>();

// #region trace
// Each request's span (Phase 10, lesson 4), the first one: that way it measures everything else.
// @hono/otel creates it and names it with the route's template (GET /v2/orders/:id), not the URL.
// Without instrumentation (without OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, in instrumentation.ts), it
// does nothing.
app.use(httpInstrumentationMiddleware());
// requestId gives each request an identifier and returns it in the X-Request-Id header. It goes in
// the span too, as shop.request_id: with the id the frontend sees, the trace is found in Jaeger.
app.use(requestId());
// The span's URL (url.full) goes without the query: a trace must not carry what the log doesn't
// (urlWithoutQuery, in instrumentation.ts).
app.use(async (c, next) => {
  trace.getActiveSpan()?.setAttribute('shop.request_id', c.get('requestId'));
  await next();
});
// #endregion trace
app.use(requestLog);
// With VALIDATE_RESPONSES, every JSON response of v2 is checked against the contract, after it has
// been made (contract-responses.ts, Phase 10, lesson 3). It goes here, the first one after the log,
// so it also sees what the middleware further down answer without reaching the route (the CSRF
// check, the session). Without the variable, nothing is added.
if (config.VALIDATE_RESPONSES !== 'no')
  app.use('/v2/*', validateResponses(config.VALIDATE_RESPONSES));
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

// Version 2's contract, in OpenAPI 3.1: OpenAPIHono writes it from v2's routes and schemas
// (contract-responses.ts).
app.get('/v2/openapi.json', (c) => c.json(contractDocument()));

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

// #region health
// Is the shop fine? The Dockerfile's HEALTHCHECK asks every few seconds. Without the database the
// shop can hardly do anything, so it only answers 200 if PostgreSQL replies; if not, 503 Service
// Unavailable. And since Phase 9 (lesson 4), 503 also while shutting down (shutdown.ts), even if
// the database replies: this copy is leaving. Docker and deploy.sh read it; nginx doesn't ask
// /health (it only sees whether the real requests fail).
// Since Phase 10 (lesson 6) there are two more, /health/live and /health/ready, and /health stays
// as it was, without being another name for either: it is what Docker and deploy.sh have
// understood by "healthy" since Phase 7, and a new copy that can't reach the database must not
// receive traffic. Making it /health/ready would turn it bad when Redis fails, and a deployment
// during a Redis outage would roll back an image that isn't to blame. And making it /health/live
// would let through a copy that can't talk to PostgreSQL.
app.get('/health', async (c) => {
  if (shuttingDown()) return httpProblem(c, 503, 'The shop is shutting down');
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok' });
  } catch {
    return httpProblem(c, 503, 'The database is not responding');
  }
});

// #region live
// Liveness: is the process alive and answering? It asks nobody else, on purpose. Whoever uses it (an
// orchestrator like Kubernetes) restarts the copy that doesn't answer. If it looked at the
// database, a PostgreSQL outage would make it restart all the copies at once, and restarting them
// doesn't fix PostgreSQL: it only adds copies starting up to an outage that was already there.
// Only 503 while shutting down.
app.get('/health/live', (c) => {
  if (shuttingDown()) return c.json({ status: 'shutting-down' }, 503);
  return c.json({ status: 'ok' });
});
// #endregion live

// #region ready
// Readiness: can this copy serve right now? It asks PostgreSQL, the queue's Redis and the cache's,
// each with 500 ms at most (health.ts), and says what it saw of each one. Whoever uses it (a load
// balancer, an orchestrator) stops sending requests to the copy that says 503, without restarting
// it, until it says 200 again. The cache doesn't make it fail: without it, the shop works.
// While shutting down, 503 at once, without asking anybody: this copy is leaving, whoever answers,
// and PostgreSQL's pool may be closing.
app.get('/health/ready', async (c) => {
  if (shuttingDown()) return c.json({ status: 'shutting-down' }, 503);
  const { ready, checks } = await checkAll();
  return c.json({ status: ready ? 'ok' : 'failing', checks }, ready ? 200 : 503);
});
// #endregion ready
// #endregion health

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
