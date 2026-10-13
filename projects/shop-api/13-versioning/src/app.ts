// The API for Phase 4, lesson 4: two versions at once. Version 2 is the current one; version 1
// keeps working for whoever still uses it, but warns that it's going to be retired.
// #region import
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { log } from './log.ts';
import { requestLog } from './middleware/request-log.ts';
import { httpProblem, problem } from './problems.ts';
import { SUNSET, v1 } from './v1.ts';
import { v2 } from './v2.ts';
// #endregion import

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
