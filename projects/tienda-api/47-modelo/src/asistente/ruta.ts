// POST /v2/asistente (Fase 11, lección 1): el cliente manda la conversación, la tienda se la pasa al
// modelo con sus instrucciones y devuelve la respuesta y los tokens que ha costado. La ruta, con lo
// que recibe y lo que responde, está en el contrato (contrato.ts y esquemas.ts), como las demás de
// v2; exigir('asistente:usar') ya ha comprobado que es un cliente con su sesión, y OpenAPIHono, que
// la conversación cumple el esquema. v2.ts la registra.
import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { config } from '../config.ts';
import type * as contrato from '../contrato.ts';
import type { Entorno } from '../entorno.ts';
import {
  demasiadosIntentos,
  type Estado,
  ipDe,
  type Limitador,
  limites,
  LimitesSinAlmacen,
  ponerCabeceras,
  sinAlmacen,
} from '../limites.ts';
import { log } from '../log.ts';
import { falloDelServidor, problema, tipo } from '../problemas.ts';
import { cliente, preguntar } from './cliente.ts';
import { respuestaDelModelo } from './conversacion.ts';
import { falloDelModelo } from './errores.ts';

// Sin ANTHROPIC_API_KEY: la tienda funciona, pero no tiene asistente. Sin Retry-After: esperar no lo
// arregla.
const sinAsistente = (c: Context) =>
  problema(c, {
    type: tipo('asistente-no-configurado'),
    title: 'La tienda no tiene asistente',
    status: 503,
    detail: 'Esta tienda no está configurada para contestar con un modelo de IA',
  });

// #region responder
// El tipo de la ruta sale de su definición en el contrato: con él, c.req.valid('json') sabe qué
// trae, y TypeScript comprueba cada respuesta contra el contrato.
type Ruta = RouteHandler<typeof contrato.preguntarAsistente, Entorno>;

export const responderAsistente: Ruta = async (c) => {
  if (cliente === undefined) return sinAsistente(c);
  // Antes de gastar nada, los límites de preguntas (abajo): si no caben, el modelo ni se entera.
  const limitada = await comprobarLimites(c);
  if (limitada !== undefined) return limitada;
  const requestId = c.get('requestId');
  // #region plazo-y-senal
  // El tiempo máximo de la respuesta entera (config.ts): cuando se cumple, esta señal cancela la
  // llamada al modelo, también mientras el SDK espera para repetirla.
  const plazo = AbortSignal.timeout(config.ASISTENTE_TIEMPO_MAXIMO_MS);
  // Y la señal de la petición del cliente, c.req.raw.signal: @hono/node-server la cancela si la
  // conexión se cierra antes de que salga la respuesta (el cliente cierra la pestaña, Ctrl + C en
  // curl). La llamada al modelo recibe las dos juntas (AbortSignal.any), y la cancela la primera
  // que salte: así la tienda no sigue esperando, ni pagando, una respuesta que nadie va a leer.
  const senal = AbortSignal.any([plazo, c.req.raw.signal]);
  // #endregion plazo-y-senal
  try {
    const mensaje = await preguntar(cliente, c.req.valid('json').mensajes, senal);
    const respuesta = respuestaDelModelo(mensaje);
    // Una negativa no es un error: el cliente recibe la frase fija de la tienda. Al log va el id del
    // mensaje y la categoría que da la API (nunca la conversación, que es del cliente).
    if (respuesta.rechazada) {
      log.warn(
        { requestId, mensaje: mensaje.id, categoria: mensaje.stop_details?.category ?? null },
        'el modelo se ha negado a contestar',
      );
    }
    return c.json(respuesta, 200);
  } catch (error) {
    const fallo = falloDelModelo(error);
    if (fallo === undefined) throw error;
    if (c.req.raw.signal.aborted) {
      // El cliente se ha ido, y su señal ha cancelado la llamada (APIUserAbortError): no es un
      // fallo del modelo, y al log va solo eso. La respuesta, el 503 de abajo, ya no la lee nadie.
      log.info({ requestId }, 'el cliente se ha ido: se cancela la llamada al modelo');
    } else if (fallo.estado === 500) {
      // La API ha rechazado la petición de la tienda: en el log va qué ha dicho (el código, el tipo
      // y su mensaje, dentro de err). Al cliente, el mismo 500 que cualquier otro fallo del servidor.
      log.error(
        { err: error, requestId },
        'la API del modelo ha rechazado la petición de la tienda',
      );
    } else {
      log.warn({ err: error, requestId }, 'el modelo no está disponible');
    }
    if (fallo.estado === 500) return falloDelServidor(c);
    return problema(
      c,
      {
        type: tipo('asistente-no-disponible'),
        title: 'El asistente no está disponible ahora',
        status: 503,
        detail: `${fallo.detalle}: vuelve a intentarlo en ${fallo.reintentarEn} segundos`,
      },
      { 'Retry-After': String(fallo.reintentarEn) },
    );
  }
};
// #endregion responder

// #region limites
// Cada pregunta cuenta dos veces (limites.ts): en la cuenta de su cliente y en la de su IP. Si una
// de las dos está llena, 429 con Retry-After. Si caben, se apuntan antes de preguntar al modelo, y
// la respuesta lleva las cabeceras RateLimit con lo que queda. Si Redis no contesta, los límites se
// cierran (LimitesSinAlmacen): 503, como al iniciar sesión. Devuelve esa respuesta de error, o
// undefined si la pregunta cabe.
async function comprobarLimites(c: Context<Entorno>) {
  const porCliente = String(c.var.usuario!.id);
  const porIp = ipDe(c);
  const comprobar = async (): Promise<[Limitador, Estado][]> => [
    [limites.asistentePorCliente, await limites.asistentePorCliente.comprobar(porCliente)],
    [limites.asistentePorIp, await limites.asistentePorIp.comprobar(porIp)],
  ];
  try {
    const antes = await comprobar();
    if (antes.some(([, estado]) => !estado.permitido)) return demasiadosIntentos(c, antes);
    await limites.asistentePorCliente.apuntar(porCliente);
    await limites.asistentePorIp.apuntar(porIp);
    ponerCabeceras(c, await comprobar());
    return undefined;
  } catch (error) {
    if (error instanceof LimitesSinAlmacen) {
      return sinAlmacen(
        c,
        'Ahora mismo el asistente no puede contestar. Vuelve a intentarlo en unos segundos',
      );
    }
    throw error;
  }
}
// #endregion limites
