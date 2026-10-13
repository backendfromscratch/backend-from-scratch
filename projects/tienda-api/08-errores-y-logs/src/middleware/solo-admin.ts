// #region solo-admin
import type { MiddlewareHandler } from 'hono';
import { config } from '../config.ts';

// Si la petición no trae el token, responde 401 y no la deja seguir.
export const soloAdmin: MiddlewareHandler = async (c, next) => {
  if (c.req.header('Authorization') !== `Bearer ${config.ADMIN_TOKEN}`) {
    return c.json({ error: 'Hace falta un token válido' }, 401, {
      'WWW-Authenticate': 'Bearer',
    });
  }
  await next();
};
// #endregion solo-admin
