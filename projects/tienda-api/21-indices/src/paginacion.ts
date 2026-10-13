// Partir una lista larga en páginas, de dos formas: con un desplazamiento («sáltate los 10
// primeros») o con un cursor («dame los que van después de este»). Las dos, ya en SQL: PostgreSQL
// devuelve solo los pedidos de la página.
import { pool } from './bd.ts';
import { aPedido, PEDIDO, type EstadoPedido, type FilaPedido } from './datos.ts';

// #region cursor
// El cursor lleva la fecha y el id del último pedido de la página, en base64url. Antes llevaba solo
// el id; como el cliente no tiene que entenderlo, solo devolverlo, el servidor ha podido cambiar lo
// que lleva dentro sin romper a nadie. Lo único: un cursor de antes ya no vale (422), y el cliente
// tiene que volver a empezar por la primera página.
export interface Cursor {
  creadoEn: string;
  id: number;
}

export function crearCursor(pedido: Cursor): string {
  return Buffer.from(JSON.stringify([pedido.creadoEn, pedido.id])).toString('base64url');
}

// Si el texto no era un cursor, devuelve null, y el esquema lo rechaza.
export function leerCursor(cursor: string): Cursor | null {
  try {
    const [creadoEn, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return { creadoEn, id };
  } catch {
    return null;
  }
}
// #endregion cursor

// #region pagina-por-cursor
// #region consulta-cursor
// (creado_en, id) < ($1, $2) compara las dos columnas a la vez, como se ordenan las palabras en un
// diccionario: primero la fecha y, si es la misma, el id. Son los pedidos que van después del
// cursor. El índice de la migración 003 tiene este mismo orden: PostgreSQL va directo al cursor y
// lee solo los de la página, haya 25 pedidos o un millón.
export const PEDIDOS_POR_CURSOR = `
  SELECT ${PEDIDO} FROM pedidos
  WHERE (creado_en, id) < ($1, $2) AND ($3::text IS NULL OR estado = $3)
  ORDER BY creado_en DESC, id DESC
  LIMIT $4`;
// #endregion consulta-cursor

// Se pide uno más de los que caben en la página: si llega, es que hay otra después.
export async function paginaPorCursor(limite: number, despuesDe?: Cursor, estado?: EstadoPedido) {
  // Sin cursor, la primera página: los que van «después» del infinito, que son todos.
  const { creadoEn, id } = despuesDe ?? { creadoEn: 'infinity', id: 0 };
  const { rows } = await pool.query<FilaPedido>(PEDIDOS_POR_CURSOR, [
    creadoEn,
    id,
    estado ?? null,
    limite + 1,
  ]);
  const pagina = rows.slice(0, limite).map(aPedido);
  const hayMas = rows.length > limite;
  return { pagina, siguiente: hayMas ? crearCursor(pagina.at(-1)!) : undefined };
}
// #endregion pagina-por-cursor

// #region pagina-por-desplazamiento
// Sáltate los «desplazamiento» primeros y dame «limite». Es lo más directo, pero si entra un pedido
// nuevo entre una página y la siguiente, todo se corre un puesto y un pedido sale dos veces. Y
// OFFSET no se salta las filas gratis: PostgreSQL las lee y las tira. La página 1000 lee 10 000.
export async function paginaPorDesplazamiento(
  limite: number,
  desplazamiento: number,
  estado?: EstadoPedido,
) {
  const { rows } = await pool.query<FilaPedido>(
    `SELECT ${PEDIDO} FROM pedidos
     WHERE $1::text IS NULL OR estado = $1
     ORDER BY creado_en DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [estado ?? null, limite + 1, desplazamiento],
  );
  const pagina = rows.slice(0, limite).map(aPedido);
  const hayMas = rows.length > limite;
  return { pagina, siguiente: hayMas ? desplazamiento + limite : undefined };
}
// #endregion pagina-por-desplazamiento

// #region enlace
// La cabecera Link (RFC 8288) dice dónde está la página siguiente: la misma URL, con otro cursor.
// El cliente no tiene que construirla, solo seguirla.
export function enlaceSiguiente(urlActual: string, parametro: string, valor: string): string {
  const url = new URL(urlActual);
  url.searchParams.set(parametro, valor);
  return `<${url.href}>; rel="next"`;
}
// #endregion enlace
