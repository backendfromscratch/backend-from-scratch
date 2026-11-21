// POST /v2/asistente (Fase 11, lecciones 1 a 3 y 6): el cliente manda la conversación, la tienda se
// la pasa al modelo con sus instrucciones y sus herramientas, ejecuta las que pida (bucle.ts) y
// devuelve la respuesta, los tokens que ha costado y, desde la lección 6, las secciones de la ayuda
// que cita (fuentes). Entera, en JSON, o, si el cliente la pide en
// streaming (Accept: text/event-stream), trozo a trozo, según el modelo la escribe. La ruta, con lo
// que recibe y lo que responde, está en el contrato (contrato.ts y esquemas.ts), como las demás de
// v2; exigir('asistente:usar') ya ha comprobado que es un cliente con su sesión, y OpenAPIHono, que
// la conversación cumple el esquema. v2.ts la registra.
import type Anthropic from '@anthropic-ai/sdk';
import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { accepts } from 'hono/accepts';
import { streamSSE } from 'hono/streaming';
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
import {
  falloDelServidor,
  type Problema,
  problema,
  problemaDelServidor,
  tipo,
} from '../problemas.ts';
import { conversar, type Pasos, type Resultado, VUELTAS_MAXIMAS } from './bucle.ts';
import { cliente, preguntar, preguntarEnFlujo } from './cliente.ts';
import {
  type Mensaje,
  mensajesDeLaApi,
  respuestaDelModelo,
  SEPARADOR,
  TEXTO_SIN_TERMINAR,
} from './conversacion.ts';
import { type Fallo, falloDelModelo, noDisponible } from './errores.ts';
import { comoSSE, type EventoAsistente, eventoDeHerramienta, eventoDeLaTienda } from './eventos.ts';
import type { Fuente, Quien } from './herramientas/herramienta.ts';
import { ejecutarHerramienta, etiquetaDe } from './herramientas/index.ts';

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
  const { mensajes } = c.req.valid('json');
  // #region quien
  // Las herramientas trabajan para el cliente de la sesión (herramientas/herramienta.ts): un
  // cliente, porque exigir('asistente:usar') solo deja pasar a clientes, y un cliente siempre es
  // una persona con su sesión.
  const quien: Quien = { clienteId: c.var.usuario!.id };
  // #endregion quien
  // #region plazo-y-senal
  // El tiempo máximo de la respuesta entera, con todas sus vueltas (config.ts): cuando se cumple,
  // esta señal cancela la llamada al modelo que esté en marcha, o la siguiente.
  const plazo = AbortSignal.timeout(config.ASISTENTE_TIEMPO_MAXIMO_MS);
  // Y la señal de la petición del cliente, c.req.raw.signal: @hono/node-server la cancela si la
  // conexión se cierra antes de que salga la respuesta (el cliente cierra la pestaña, Ctrl + C en
  // curl). La llamada al modelo recibe las dos juntas (AbortSignal.any), y la cancela la primera
  // que salte: así la tienda no sigue esperando, ni pagando, una respuesta que nadie va a leer.
  const senal = AbortSignal.any([plazo, c.req.raw.signal]);
  // #endregion plazo-y-senal
  if (pideFlujo(c)) return responderEnFlujo(c, cliente, mensajes, quien, senal);
  const requestId = c.get('requestId');
  // Las secciones de la ayuda que lee el modelo (lección 6): ejecutarHerramienta apunta aquí lo que
  // devuelve buscar_en_ayuda, en todas las vueltas. Las fuentes de la respuesta, las que cite.
  const leidas: Fuente[] = [];
  try {
    const pasos = pasosEnteros(cliente, quien, senal, requestId, leidas);
    const resultado = await conversar(mensajesDeLaApi(mensajes), pasos);
    return c.json(respuestaYAvisos(requestId, resultado, leidas), 200);
  } catch (error) {
    return responderFallo(c, error);
  }
};

// Lo que el bucle (bucle.ts) necesita para la respuesta entera: cada vuelta es un
// messages.create(), y cada herramienta se ejecuta para el cliente de la sesión.
function pasosEnteros(
  cliente: Anthropic,
  quien: Quien,
  senal: AbortSignal,
  requestId: string,
  leidas: Fuente[],
): Pasos {
  return {
    preguntar: (conversacion) => preguntar(cliente, conversacion, senal),
    ejecutar: (llamada) => ejecutarHerramienta(llamada, quien, requestId, leidas),
  };
}
// #endregion responder

// #region negociar
// ¿Entera o en streaming? Lo dice el cliente en Accept, la cabecera con los tipos de contenido que
// quiere recibir: con text/event-stream, eventos; con cualquier otra cosa (application/json, el */*
// que manda curl o ninguna), la respuesta entera en JSON, como en la lección 1. Es una sola ruta
// que contesta de dos formas, porque lo que se pide es lo mismo: la respuesta del asistente.
// accepts, de Hono, entiende los pesos de la cabecera (text/event-stream;q=0 es «eso no»).
function pideFlujo(c: Context): boolean {
  const formato = accepts(c, {
    header: 'Accept',
    supports: ['application/json', 'text/event-stream'],
    default: 'application/json',
  });
  return formato === 'text/event-stream';
}
// #endregion negociar

// #region flujo
// Una vuelta en streaming, ya abierta: la llamada, quien lee sus eventos de uno en uno y el primero.
interface VueltaAbierta {
  flujo: ReturnType<typeof preguntarEnFlujo>;
  eventos: AsyncIterator<Anthropic.MessageStreamEvent>;
  evento: IteratorResult<Anthropic.MessageStreamEvent>;
}

// Abre una vuelta y espera a su primer evento (message_start): si la API contesta un error (un
// 429, un 529) o no contesta, sale aquí. El lector se pide ya, antes de esperar nada: los eventos
// que el SDK lee antes de que haya un lector, ese lector ya no los ve.
async function abrirVuelta(
  cliente: Anthropic,
  conversacion: Anthropic.MessageParam[],
  senal: AbortSignal,
): Promise<VueltaAbierta> {
  const flujo = preguntarEnFlujo(cliente, conversacion, senal);
  const eventos = flujo[Symbol.asyncIterator]();
  return { flujo, eventos, evento: await eventos.next() };
}

// La respuesta en streaming (lecciones 2 y 3). Del modelo llegan sus eventos; al cliente, los de la
// tienda (eventos.ts): texto con cada trozo, herramienta con cada llamada, fin al terminar y error
// si algo falla a medias. Con herramientas, una respuesta son varias vueltas, y cada una es una
// llamada al modelo en streaming: el cliente ve el texto de todas, una detrás de otra.
async function responderEnFlujo(
  c: Context,
  cliente: Anthropic,
  mensajes: Mensaje[],
  quien: Quien,
  senal: AbortSignal,
) {
  const requestId = c.get('requestId');
  // Con él se cancela la llamada al modelo si el cliente se va a medias. Cada llamada recibe las
  // dos señales juntas (AbortSignal.any): la cancela la primera que salte.
  const cancelar = new AbortController();
  const senalDelFlujo = AbortSignal.any([cancelar.signal, senal]);
  const inicio = mensajesDeLaApi(mensajes);
  // Las secciones que lee el modelo, como sin streaming: las fuentes, las que cite, van en fin.
  const leidas: Fuente[] = [];

  // Hasta que llega el primer evento de la primera vuelta, la tienda no ha mandado nada al cliente.
  // Un fallo aquí (un 429, un 529, el modelo que no contesta) es una respuesta de error normal, con
  // su código de estado y su Retry-After, como sin streaming.
  let abierta: VueltaAbierta | undefined;
  try {
    abierta = await abrirVuelta(cliente, inicio, senalDelFlujo);
  } catch (error) {
    return responderFallo(c, error);
  }

  // Desde aquí la respuesta es un 200 con Content-Type: text/event-stream, y sus cabeceras salen
  // ya: un fallo de ahora en adelante ya no puede cambiar el código de estado, y va como evento.
  return streamSSE(c, async (sse) => {
    // El cliente se va (cierra la pestaña, Ctrl + C en curl): se cancela la llamada al modelo, que
    // lanza un error en quien la está leyendo (abajo). Si la respuesta ya ha terminado, no hace
    // nada.
    sse.onAbort(() => cancelar.abort());
    const enviar = (evento: EventoAsistente) => sse.writeSSE(comoSSE(evento));

    // Los trozos de texto, al cliente. El primero de una vuelta, si ya había texto de otra, va
    // después de una línea en blanco (SEPARADOR), como en la respuesta entera (respuestaDelModelo):
    // así los eventos texto, juntos, siguen siendo la respuesta.
    let hayTexto = false;
    let vueltaNueva = true;
    const enviarTexto = async (texto: string) => {
      if (vueltaNueva && hayTexto) await enviar({ evento: 'texto', datos: { texto: SEPARADOR } });
      vueltaNueva = false;
      hayTexto = true;
      await enviar({ evento: 'texto', datos: { texto } });
    };

    const pasos: Pasos = {
      // Cada vuelta: la primera ya está abierta (con esta misma conversación); las demás se abren
      // aquí. Sus trozos de texto salen según llegan, y al final, el mensaje entero.
      preguntar: async (conversacion) => {
        const vuelta = abierta ?? (await abrirVuelta(cliente, conversacion, senalDelFlujo));
        abierta = undefined;
        vueltaNueva = true;
        for (let evento = vuelta.evento; !evento.done; evento = await vuelta.eventos.next()) {
          const deLaTienda = eventoDeLaTienda(evento.value);
          if (deLaTienda?.evento === 'texto') await enviarTexto(deLaTienda.datos.texto);
        }
        // Si el flujo se ha roto a medias (un evento error de la API, un corte), lanza ese error.
        return vuelta.flujo.finalMessage();
      },
      ejecutar: (llamada) => ejecutarHerramienta(llamada, quien, requestId, leidas),
      // Antes de ejecutar cada herramienta, el cliente sabe qué está haciendo el asistente.
      alUsar: (llamada) => enviar(eventoDeHerramienta(llamada, etiquetaDe(llamada.name))),
    };

    try {
      const resultado = await conversar(inicio, pasos);
      if (resultado.agotado) {
        vueltaNueva = true;
        await enviarTexto(TEXTO_SIN_TERMINAR);
      }
      await enviar({ evento: 'fin', datos: respuestaYAvisos(requestId, resultado, leidas) });
    } catch (error) {
      // El cliente se ha ido (lo ha visto onAbort, o @hono/node-server en la señal de la petición):
      // no hay a quién contárselo, y al log va una línea. Si la señal que ha saltado es la del
      // tiempo máximo, no: el cliente sigue ahí, esperando, y recibe el evento error.
      if (cancelar.signal.aborted || c.req.raw.signal.aborted) {
        log.info({ requestId }, 'el cliente se ha ido: se cancela la llamada al modelo');
        return;
      }
      await enviar({ evento: 'error', datos: problemaEnElFlujo(error, requestId) });
    }
    // Al salir de aquí, streamSSE cierra la respuesta.
  });
}
// #endregion flujo

// #region fallos
// La respuesta, con o sin streaming, y lo que va al log. Una negativa no es un error: el cliente
// recibe la frase fija de la tienda. Al log va el id del mensaje y la categoría que da la API
// (nunca la conversación, que es del cliente). Y si el modelo ha llegado al máximo de vueltas
// pidiendo herramientas, un aviso: puede ser un modelo dando vueltas, o alguien intentando que las
// dé.
function respuestaYAvisos(requestId: string, resultado: Resultado, leidas: Fuente[]) {
  const respuesta = respuestaDelModelo(resultado, leidas);
  const ultimo = resultado.mensajes.at(-1)!;
  if (respuesta.rechazada) {
    log.warn(
      { requestId, mensaje: ultimo.id, categoria: ultimo.stop_details?.category ?? null },
      'el modelo se ha negado a contestar',
    );
  }
  if (resultado.agotado) {
    log.warn(
      { requestId, mensaje: ultimo.id, vueltas: VUELTAS_MAXIMAS },
      'el asistente ha llegado al máximo de vueltas sin terminar',
    );
  }
  return respuesta;
}

// Un fallo antes de mandar nada al cliente, con o sin streaming: la respuesta de error de siempre.
// Si no es un error de la API (un fallo de programación de la tienda), sigue su camino hasta
// app.onError, como cualquier otro.
function responderFallo(c: Context, error: unknown) {
  const fallo = falloDelModelo(error);
  if (fallo === undefined) throw error;
  if (c.req.raw.signal.aborted) {
    // El cliente se ha ido, y su señal ha cancelado la llamada (APIUserAbortError): no es un fallo
    // del modelo, y al log va solo eso. La respuesta, la de abajo, ya no la lee nadie.
    log.info(
      { requestId: c.get('requestId') },
      'el cliente se ha ido: se cancela la llamada al modelo',
    );
  } else {
    apuntarFallo(error, fallo, c.get('requestId'));
  }
  // Un 500, el mismo que cualquier otro fallo del servidor.
  if (fallo.estado === 500) return falloDelServidor(c);
  return problema(c, noDisponible(fallo), { 'Retry-After': String(fallo.reintentarEn) });
}

// Un fallo con el flujo ya empezado: el mismo problema que sería sin streaming, como datos del
// evento error. Lo que no es un error de la API ya no puede llegar a app.onError (la respuesta ya
// ha empezado): se apunta aquí, igual que allí, y el cliente recibe el mismo 500.
function problemaEnElFlujo(error: unknown, requestId: string): Problema {
  const fallo = falloDelModelo(error);
  if (fallo === undefined) {
    log.error({ err: error, requestId }, 'error sin capturar');
    return problemaDelServidor(requestId);
  }
  apuntarFallo(error, fallo, requestId);
  return fallo.estado === 500 ? problemaDelServidor(requestId) : noDisponible(fallo);
}

// Al log. Si la API ha rechazado la petición de la tienda, es un error, con lo que ha dicho (el
// código, el tipo y su mensaje, dentro de err): al cliente no le llega nada de eso. Si es algo
// pasajero, un aviso.
function apuntarFallo(error: unknown, fallo: Fallo, requestId: string) {
  if (fallo.estado === 500) {
    log.error({ err: error, requestId }, 'la API del modelo ha rechazado la petición de la tienda');
  } else {
    log.warn({ err: error, requestId }, 'el modelo no está disponible');
  }
}
// #endregion fallos

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
