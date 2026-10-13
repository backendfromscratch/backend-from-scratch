// #region request-log
import type { MiddlewareHandler } from 'hono';
import { log } from '../log.ts';

// The same idea as in lesson 6, now with pino: each request, one JSON line with its id.
export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();
  log.info(
    {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    },
    'request',
  );
};
// #endregion request-log
