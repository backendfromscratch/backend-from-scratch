// #region solo-admin
import type { MiddlewareHandler } from 'hono';
import { TOKEN_ADMIN } from '../config.ts';

// Si la petición no trae el token, responde 401 y no la deja seguir.
export const soloAdmin: MiddlewareHandler = async (c, next) => {
  if (c.req.header('Authorization') !== `Bearer ${TOKEN_ADMIN}`) {
    return c.json({ error: 'Hace falta un token válido' }, 401, {
      'WWW-Authenticate': 'Bearer',
    });
  }
  await next();
};
// #endregion solo-admin
