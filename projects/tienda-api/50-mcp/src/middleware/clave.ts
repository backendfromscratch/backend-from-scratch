// La clave de API en cada petición: Authorization: Bearer tienda_….
import type { MiddlewareHandler } from 'hono';
import { claveDe, PREFIJO_CLAVE } from '../claves.ts';
import type { Entorno } from '../entorno.ts';

// #region cargar-clave
// Como cargarSesion, pero para los programas: si la petición trae una clave que existe, la deja en
// c.var.clave. Por el prefijo se distingue de un id de sesión, que también puede llegar como Bearer.
export const cargarClave: MiddlewareHandler<Entorno> = async (c, next) => {
  const token = /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
  if (token?.startsWith(PREFIJO_CLAVE)) {
    const clave = await claveDe(token);
    if (clave) c.set('clave', clave);
  }
  await next();
};
// #endregion cargar-clave
