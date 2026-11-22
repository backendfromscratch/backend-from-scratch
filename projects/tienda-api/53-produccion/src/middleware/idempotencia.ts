// La cabecera Idempotency-Key: el cliente pone una clave única a cada operación y, si la repite
// (porque no le llegó la respuesta y reintenta), recibe la misma respuesta en vez de crear otra.
// Es práctica común (Stripe, por ejemplo), descrita en un borrador del IETF que aún no es estándar.
import type { MiddlewareHandler } from 'hono';
import type { Entorno } from '../entorno.ts';
import { eq } from 'drizzle-orm';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { bd } from '../bd.ts';
import { clavesIdempotencia } from '../esquema.ts';
import { problema, tipo } from '../problemas.ts';

// #region guardadas
// Lo que se respondió a cada clave, en la tabla claves_idempotencia: un reinicio del servidor ya
// no lo olvida. En producción, además, se borrarían las de más de un día.
interface RespuestaGuardada {
  cuerpoPeticion: string;
  estado: ContentfulStatusCode;
  cuerpo: string;
  location: string | null;
}

async function buscarGuardada(clave: string): Promise<RespuestaGuardada | undefined> {
  const [fila] = await bd
    .select()
    .from(clavesIdempotencia)
    .where(eq(clavesIdempotencia.clave, clave));
  // En la tabla, el estado es un número cualquiera; aquí, el código de una respuesta 2xx con cuerpo.
  return fila && { ...fila, estado: fila.estado as ContentfulStatusCode };
}

// onConflictDoNothing (ON CONFLICT DO NOTHING): si otra petición con la misma clave la guardó justo
// antes, se queda la suya.
async function guardar(clave: string, respuesta: RespuestaGuardada) {
  await bd
    .insert(clavesIdempotencia)
    .values({ clave, ...respuesta })
    .onConflictDoNothing();
}
// #endregion guardadas

// #region idempotencia-repetida
export const idempotencia: MiddlewareHandler<Entorno> = async (c, next) => {
  const cabecera = c.req.header('Idempotency-Key');
  if (cabecera === undefined) return next(); // sin clave, como siempre
  // Cada clave se guarda con la cuenta que la usó (lección 5 de la Fase 6). Si no, dos clientes que
  // usaran la misma clave, por casualidad o a propósito, recibirían el pedido del otro.
  const clave = `${c.var.usuario?.id ?? '-'}:${cabecera}`;

  const cuerpoPeticion = await c.req.text();
  const guardada = await buscarGuardada(clave);
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
    await guardar(clave, { cuerpoPeticion, estado, cuerpo, location });
  }
  // #endregion idempotencia-guardar
};
