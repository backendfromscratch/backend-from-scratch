// Partir una lista larga en páginas, de dos formas: con un desplazamiento («sáltate los 10
// primeros») o con un cursor («dame los que van después de este»).
import type { Pedido } from './datos.ts';

// #region cursor
// El cursor es el id del último pedido de la página, en base64url. El cliente no tiene que
// entenderlo: solo devolverlo para pedir la página siguiente. Así el servidor puede cambiar lo
// que lleva dentro sin romper a nadie.
export function crearCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64url');
}

// Si el texto no era un cursor, el resultado es NaN o 0, y el esquema lo rechaza.
export function leerCursor(cursor: string): number {
  return Number(Buffer.from(cursor, 'base64url').toString());
}
// #endregion cursor

// #region pagina-por-cursor
// La lista va del más nuevo al más antiguo: los que van después del cursor son los de id menor.
// Aunque entren pedidos nuevos, el cursor sigue señalando el mismo sitio.
export function paginaPorCursor(lista: Pedido[], limite: number, despuesDe?: number) {
  const restantes =
    despuesDe === undefined ? lista : lista.filter((pedido) => pedido.id < despuesDe);
  const pagina = restantes.slice(0, limite);
  const hayMas = restantes.length > limite;
  return { pagina, siguiente: hayMas ? crearCursor(pagina.at(-1)!.id) : undefined };
}
// #endregion pagina-por-cursor

// #region pagina-por-desplazamiento
// Sáltate los «desplazamiento» primeros y dame «limite». Es lo más directo, pero si entra un pedido nuevo
// entre una página y la siguiente, todo se corre un puesto y un pedido sale dos veces.
export function paginaPorDesplazamiento(lista: Pedido[], limite: number, desplazamiento: number) {
  const pagina = lista.slice(desplazamiento, desplazamiento + limite);
  const hayMas = lista.length > desplazamiento + limite;
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
