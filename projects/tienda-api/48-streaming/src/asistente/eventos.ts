// Los eventos del asistente en streaming (Fase 11, lección 2). El modelo manda sus propios eventos
// (message_start, content_block_delta, message_delta…), con la forma que decide su API; la tienda
// no se los pasa al navegador tal cual, sino que los traduce a los suyos, pocos y con sus nombres.
// Así el frontend solo conoce los eventos de la tienda: si mañana cambia el modelo, o su API, se
// cambia esta traducción y el frontend ni se entera. Son funciones puras: los tests las prueban
// sin red, y ruta.ts las usa.
import type Anthropic from '@anthropic-ai/sdk';
import type { Problema } from '../problemas.ts';
import type { Respuesta } from './conversacion.ts';

// #region eventos
// Lo que la tienda manda por el flujo: cada evento con su nombre (la línea event:) y sus datos (la
// línea data:, en JSON).
//   texto  un trozo más de la respuesta, según llega del modelo: { texto }. Todos juntos, en orden,
//          son la respuesta entera.
//   fin    la respuesta ha terminado. Sus datos son la misma respuesta que sin streaming
//          (respuestaDelModelo, en conversacion.ts): el texto entero, si el modelo se ha negado y
//          los tokens que ha costado. Si se ha negado, rechazada es true y el texto es la frase
//          fija de la tienda: el frontend cambia por ella lo que haya enseñado hasta ahí.
//   error  algo ha fallado a medias: un Problem Details, como el cuerpo de cualquier error de la
//          tienda. Después, el flujo se cierra, sin fin.
// La lección 3 añade uno más, herramienta (qué está haciendo el asistente: «buscando productos…»):
// otra línea en este tipo y su traducción abajo; ruta.ts los escribe todos igual (comoSSE).
export type EventoAsistente =
  | { evento: 'texto'; datos: { texto: string } }
  | { evento: 'fin'; datos: Respuesta }
  | { evento: 'error'; datos: Problema };
// #endregion eventos

// #region traducir
// Un evento del modelo, en uno de la tienda; undefined si no hay nada que contarle al cliente. Solo
// pasan los trozos de texto (text_delta). El resto se queda en la tienda: message_start y
// message_delta traen los tokens y el porqué de la parada, que llegan juntos en fin; lo que el
// modelo piensa antes de contestar (thinking) no es para el cliente; y los demás solo marcan dónde
// empieza y acaba cada bloque.
export function eventoDeLaTienda(
  evento: Anthropic.MessageStreamEvent,
): EventoAsistente | undefined {
  if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
    return { evento: 'texto', datos: { texto: evento.delta.text } };
  }
  return undefined;
}
// #endregion traducir

// #region sse
// Cada evento, como lo escribe writeSSE de Hono: event: con el nombre y data: con los datos en
// JSON. JSON.stringify escribe un salto de línea del texto como \n, así que los datos ocupan una
// sola línea data:, aunque el texto tenga varias.
export function comoSSE(evento: EventoAsistente): { event: string; data: string } {
  return { event: evento.evento, data: JSON.stringify(evento.datos) };
}
// #endregion sse
