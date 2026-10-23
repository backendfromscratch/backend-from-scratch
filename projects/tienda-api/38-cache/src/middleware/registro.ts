// #region registro
import type { MiddlewareHandler } from 'hono';
import { log } from '../log.ts';

// La misma idea que en la lección 6 de la Fase 3, ahora con pino: cada petición, una línea JSON con su id.
export const registro: MiddlewareHandler = async (c, next) => {
  const inicio = performance.now();
  await next();
  log.info(
    {
      requestId: c.get('requestId'),
      metodo: c.req.method,
      ruta: c.req.path,
      estado: c.res.status,
      ms: Math.round(performance.now() - inicio),
    },
    'petición',
  );
};
// #endregion registro
