// #region registro
import type { MiddlewareHandler } from 'hono';

// Anota cada petición con su método, su ruta, su código y lo que ha tardado.
export const registro: MiddlewareHandler = async (c, next) => {
  const inicio = performance.now();
  await next(); // aquí pasa la petición a la siguiente capa, y espera a que vuelva la respuesta
  const ms = Math.round(performance.now() - inicio);
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms} ms`);
};
// #endregion registro
