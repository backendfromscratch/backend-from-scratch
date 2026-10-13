// #region request-log
import type { MiddlewareHandler } from 'hono';

// Logs each request with its method, its path, its status code and how long it took.
export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next(); // here the request goes on to the next layer, and waits for the response to return
  const ms = Math.round(performance.now() - start);
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms} ms`);
};
// #endregion request-log
