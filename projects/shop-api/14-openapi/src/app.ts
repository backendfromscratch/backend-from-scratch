// The API for Phase 4, lesson 5: version 2, documented with OpenAPI. The contract is at
// /v2/openapi.json and the page that shows it, at /docs.
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { log } from './log.ts';
import { requestLog } from './middleware/request-log.ts';
import { httpProblem, problem } from './problems.ts';
import { SUNSET, v1 } from './v1.ts';
import { v2 } from './v2.ts';

export const app = new Hono();

// requestId gives each request an identifier and returns it in the X-Request-Id header.
app.use(requestId());
app.use(requestLog);
app.use(cors({ origin: 'https://shop.example' }));

// #region versions
// Each version, under its prefix: /v1/products and /v2/products.
app.route('/v1', v1);
app.route('/v2', v2);

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
// #endregion versions

// #region docs
// #region json-contract
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
// #endregion json-contract

// #region docs-page
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
// #endregion docs-page
// #endregion docs

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
