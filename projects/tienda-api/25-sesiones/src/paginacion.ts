// Partir una lista larga en páginas, de dos formas: con un desplazamiento («sáltate los 10
// primeros») o con un cursor («dame los que van después de este»). Las dos, ya en SQL: PostgreSQL
// devuelve solo los pedidos de la página.
import { and, desc, eq, sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import { aPedido, type EstadoPedido } from './datos.ts';
import { pedidos } from './esquema.ts';

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
// (creado_en, id) < (fecha, id) compara las dos columnas a la vez, como se ordenan las palabras en
// un diccionario: primero la fecha y, si es la misma, el id. Son los pedidos que van después del
// cursor. Drizzle no tiene una función para comparar dos columnas a la vez: ese trozo va en SQL
// (sql`…`), con los valores como parámetros. El índice de la migración 003 tiene este mismo orden.
// Con Drizzle, una condición que no hace falta (sin cursor, sin estado) se queda en undefined, y
// and() se la salta: ya no hace falta el truco del infinito.
export function consultaPorCursor(limite: number, despuesDe?: Cursor, estado?: EstadoPedido) {
  return bd
    .select()
    .from(pedidos)
    .where(
      and(
        despuesDe &&
          sql`(${pedidos.creadoEn}, ${pedidos.id}) < (${despuesDe.creadoEn}, ${despuesDe.id})`,
        estado && eq(pedidos.estado, estado),
      ),
    )
    .orderBy(desc(pedidos.creadoEn), desc(pedidos.id))
    .limit(limite);
}

// Se pide uno más de los que caben en la página: si llega, es que hay otra después.
export async function paginaPorCursor(limite: number, despuesDe?: Cursor, estado?: EstadoPedido) {
  const filas = await consultaPorCursor(limite + 1, despuesDe, estado);
  const pagina = filas.slice(0, limite).map(aPedido);
  const hayMas = filas.length > limite;
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
  const filas = await bd
    .select()
    .from(pedidos)
    .where(estado && eq(pedidos.estado, estado))
    .orderBy(desc(pedidos.creadoEn), desc(pedidos.id))
    .limit(limite + 1)
    .offset(desplazamiento);
  const pagina = filas.slice(0, limite).map(aPedido);
  const hayMas = filas.length > limite;
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
