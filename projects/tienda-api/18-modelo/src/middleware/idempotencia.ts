// La cabecera Idempotency-Key: el cliente pone una clave única a cada operación y, si la repite
// (porque no le llegó la respuesta y reintenta), recibe la misma respuesta en vez de crear otra.
// Es práctica común (Stripe, por ejemplo), descrita en un borrador del IETF que aún no es estándar.
import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { problema, tipo } from '../problemas.ts';

// #region guardadas
// Lo que se respondió a cada clave. En memoria, como los datos; en producción iría a la base de
// datos (Fase 5), y cada clave caducaría pasado un día.
interface RespuestaGuardada {
  cuerpoPeticion: string;
  estado: ContentfulStatusCode;
  cuerpo: string;
  location: string | null;
}

const guardadas = new Map<string, RespuestaGuardada>();
// #endregion guardadas

// #region idempotencia-repetida
export const idempotencia: MiddlewareHandler = async (c, next) => {
  const clave = c.req.header('Idempotency-Key');
  if (clave === undefined) return next(); // sin clave, como siempre

  const cuerpoPeticion = await c.req.text();
  const guardada = guardadas.get(clave);
  if (guardada && guardada.cuerpoPeticion !== cuerpoPeticion) {
    return problema(c, {
      type: tipo('clave-reutilizada'),
      title: 'Esa clave ya se usó con otros datos',
      status: 422,
      detail: 'Usa una Idempotency-Key nueva para cada operación distinta',
    });
  }
  if (guardada) {
    // La misma petición otra vez: la misma respuesta, sin volver a hacer nada. c.header y c.body
    // la montan sobre la de esta petición, que ya lleva su propio X-Request-Id: es otra petición.
    c.header('Content-Type', 'application/json');
    if (guardada.location) c.header('Location', guardada.location);
    c.header('Idempotent-Replayed', 'true');
    return c.body(guardada.cuerpo, guardada.estado);
  }
  // #endregion idempotencia-repetida

  // #region idempotencia-guardar
  await next();
  // Solo se guarda lo que salió bien: si falló, el cliente puede corregir y reintentar.
  if (c.res.ok) {
    const cuerpo = await c.res.clone().text();
    const location = c.res.headers.get('Location');
    // ok es un 2xx con cuerpo, como el 201: el as se lo promete a TypeScript, que ve un número.
    const estado = c.res.status as ContentfulStatusCode;
    guardadas.set(clave, { cuerpoPeticion, estado, cuerpo, location });
  }
  // #endregion idempotencia-guardar
};
