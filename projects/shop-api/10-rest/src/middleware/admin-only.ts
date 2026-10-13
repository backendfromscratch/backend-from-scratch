// #region admin-only
import type { MiddlewareHandler } from 'hono';
import { config } from '../config.ts';

// If the request doesn't bring the token, it answers 401 and doesn't let it through.
export const adminOnly: MiddlewareHandler = async (c, next) => {
  if (c.req.header('Authorization') !== `Bearer ${config.ADMIN_TOKEN}`) {
    return c.json({ error: 'A valid token is required' }, 401, {
      'WWW-Authenticate': 'Bearer',
    });
  }
  await next();
};
// #endregion admin-only
