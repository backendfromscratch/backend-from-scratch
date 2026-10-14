// #region solo-admin
import type { MiddlewareHandler } from 'hono';
import { config } from '../config.ts';
import { problemaHttp } from '../problemas.ts';

// Si la petición no trae el token, responde 401 y no la deja seguir.
export const soloAdmin: MiddlewareHandler = async (c, next) => {
  if (c.req.header('Authorization') !== `Bearer ${config.ADMIN_TOKEN}`) {
    return problemaHttp(c, 401, 'Hace falta un token válido', { 'WWW-Authenticate': 'Bearer' });
  }
  await next();
};
// #endregion solo-admin
