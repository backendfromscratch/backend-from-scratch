// Los errores de la API, todos con la misma forma: la de la RFC 9457, «Problem Details for HTTP
// APIs». Un cliente que sabe leer uno sabe leerlos todos.
import { STATUS_CODES } from 'node:http';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { DatabaseError } from 'pg';

// #region problema
export interface ErrorDeCampo {
  campo: string;
  problema: string;
}

export interface Problema {
  type: string; // qué tipo de problema es: una URI, siempre la misma para el mismo tipo
  title: string; // el resumen de ese tipo, igual cada vez
  status: ContentfulStatusCode; // el código de estado, también en el cuerpo
  detail?: string; // qué ha pasado esta vez
  instance?: string; // cuál de las veces: un identificador de este caso
  errores?: ErrorDeCampo[]; // una extensión nuestra: qué falla en cada campo
}

// El cuerpo es JSON, pero con su propio tipo de contenido: application/problem+json. Así el
// cliente sabe, antes de leerlo, que es un error con esta forma. Codigo es el código exacto (404,
// 422…): así TypeScript puede comprobar que la ruta lo tiene en su contrato (lección 5).
export function problema<Codigo extends ContentfulStatusCode>(
  c: Context,
  datos: Problema & { status: Codigo },
  cabeceras: Record<string, string> = {},
) {
  return c.json(datos, datos.status, { 'Content-Type': 'application/problem+json', ...cabeceras });
}
// #endregion problema

// #region problema-http
// Cuando el código de estado ya lo dice todo (404, 405…): type es about:blank y title, la frase de
// ese código (Node las tiene en STATUS_CODES: 404 es «Not Found»). detail cuenta el caso.
export function problemaHttp<Codigo extends ContentfulStatusCode>(
  c: Context,
  status: Codigo,
  detail: string,
  cabeceras: Record<string, string> = {},
) {
  const title = STATUS_CODES[status] ?? 'Error';
  return problema(c, { type: 'about:blank', title, status, detail }, cabeceras);
}
// #endregion problema-http

// #region tipos
// Los tipos propios de la tienda, con una URI de su dominio. No hace falta que se abra, pero lo
// mejor es que lleve a una página que explique el problema y cómo evitarlo.
export const tipo = (nombre: string) => `https://tienda.example/problemas/${nombre}`;

// Los datos no cumplen el esquema, o piden algo que no existe: 422, con cada campo que falla.
export function datosNoValidos(c: Context, errores: ErrorDeCampo[]) {
  return problema(c, {
    type: tipo('datos-no-validos'),
    title: 'Los datos no son válidos',
    status: 422,
    detail: 'Mira en «errores» qué falla en cada campo.',
    errores,
  });
}
// #endregion tipos

// #region errores-bd
// Cuando PostgreSQL rechaza un cambio, dice qué regla se ha roto con un código de cinco caracteres
// (SQLSTATE). Dos de ellos no son un fallo del servidor, sino un choque con los datos que ya hay:
// 409 Conflict. Los demás siguen siendo un 500.
const CONFLICTOS: Record<string, string> = {
  // unique_violation: ese valor ya está, y no se puede repetir.
  '23505': 'Ya existe un dato igual, y no se puede repetir',
  // foreign_key_violation: otros datos apuntan a este con su clave foránea.
  '23503': 'Otros datos dependen de este: un producto con pedidos, por ejemplo, no se puede borrar',
};

// Devuelve el 409, o undefined si el error no es uno de esos.
export function conflictoDeBd(c: Context, error: unknown) {
  const detail = error instanceof DatabaseError ? CONFLICTOS[error.code ?? ''] : undefined;
  return detail === undefined ? undefined : problemaHttp(c, 409, detail);
}
// #endregion errores-bd
