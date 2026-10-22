// The API key in each request: Authorization: Bearer shop_….
import type { MiddlewareHandler } from 'hono';
import { findKey, KEY_PREFIX } from '../api-keys.ts';
import type { Env } from '../env.ts';

// #region load-api-key
// Like loadSession, but for programs: if the request brings a key that exists, it leaves it in
// c.var.apiKey. The prefix tells it apart from a session id, which can also arrive as Bearer.
export const loadApiKey: MiddlewareHandler<Env> = async (c, next) => {
  const token = /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
  if (token?.startsWith(KEY_PREFIX)) {
    const apiKey = await findKey(token);
    if (apiKey) c.set('apiKey', apiKey);
  }
  await next();
};
// #endregion load-api-key
