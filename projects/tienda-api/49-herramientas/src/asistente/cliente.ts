// El cliente de la API de Claude (Fase 11, lecciones 1 a 3): el SDK oficial, @anthropic-ai/sdk, con
// la clave de config.ts. Vive en el servidor, nunca en el navegador: quien tiene la clave gasta a
// cuenta de la tienda, y todo lo que llega al navegador lo puede leer cualquiera.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { peticionAlModelo } from './conversacion.ts';
import { definiciones } from './herramientas/index.ts';

// #region instrucciones
// Las instrucciones del asistente (el «system prompt»), en su propio fichero y versionadas como el
// código. Se leen una vez, al arrancar: cambiarlas pide reiniciar, como cambiar el código.
export const instrucciones = readFileSync(new URL('instrucciones.md', import.meta.url), 'utf8');
// #endregion instrucciones

// #region cliente
// Sin ANTHROPIC_API_KEY no hay cliente, y la ruta responde 503 (ruta.ts).
// - maxRetries: el SDK repite solo lo pasajero (un 429, un 529 o cualquier 5xx, un corte de red),
//   esperando lo que diga la cabecera retry-after o, si no la hay, cada vez un poco más. Con 2,
//   como mucho tres intentos.
// - timeout: lo que espera cada intento, en milisegundos. Sin él serían 10 minutos: demasiado para
//   alguien que espera la respuesta delante de la pantalla. En streaming cuenta hasta que la API
//   empieza a contestar (sus cabeceras); después, los eventos llegan cuando llegan.
// - La dirección de la API no se pone: el SDK lee ANTHROPIC_BASE_URL, y sin ella usa
//   https://api.anthropic.com. Los tests la apuntan a su modelo falso (test/modelo-falso.ts).
// Lo que dura una respuesta entera, con sus intentos y sus esperas, lo corta otra cosa: la señal
// de cada llamada (abajo), con ASISTENTE_TIEMPO_MAXIMO_MS (config.ts).
export const cliente =
  config.ANTHROPIC_API_KEY === undefined
    ? undefined
    : new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        maxRetries: config.MODELO_REINTENTOS,
        timeout: config.MODELO_TIEMPO_MAXIMO_MS,
      });
// #endregion cliente

// #region preguntar
// La petición, con las herramientas que el modelo puede pedir (herramientas/index.ts, lección 3).
const peticion = (conversacion: Anthropic.MessageParam[]) =>
  peticionAlModelo(
    conversacion,
    instrucciones,
    { modelo: config.MODELO, esfuerzo: config.ESFUERZO },
    definiciones,
  );

// Una pregunta al modelo, con la conversación entera: POST /v1/messages. Los errores del SDK salen
// tal cual: qué hacer con cada uno lo decide la ruta (errores.ts). senal es la señal que cancela la
// llamada: cuando salta (se acaba el tiempo del asistente), el SDK corta la conexión con la API, y
// también deja de esperar entre un intento y el siguiente.
export function preguntar(
  cliente: Anthropic,
  conversacion: Anthropic.MessageParam[],
  senal: AbortSignal,
): Promise<Anthropic.Message> {
  return cliente.messages.create(peticion(conversacion), { signal: senal });
}
// #endregion preguntar

// #region preguntar-en-flujo
// La misma pregunta, con la respuesta en streaming (lección 2): messages.stream() manda la misma
// petición con "stream": true, y la API contesta con eventos (Server-Sent Events) según el modelo
// va escribiendo. Lo que devuelve se lee evento a evento y, al final, finalMessage() da el mensaje
// entero, como lo daría messages.create(). Al llamarla no espera a nada: los errores (un 429, un
// corte de red) salen al leer los eventos. senal también salta cuando el cliente se va: la tienda
// deja de recibir una respuesta que ya nadie va a leer.
//
// Las herramientas no llevan eager_input_streaming: con él, la API mandaría lo que el modelo le
// pasa a una herramienta según lo escribe, sin esperar a tenerlo entero ni comprobarlo contra su
// esquema. Sirve cuando esa entrada es larga (un fichero entero, un documento); las de la tienda
// son un número o una palabra, que llegan de golpe igual, y sin él la API sigue comprobándolas.
export function preguntarEnFlujo(
  cliente: Anthropic,
  conversacion: Anthropic.MessageParam[],
  senal: AbortSignal,
) {
  return cliente.messages.stream(peticion(conversacion), { signal: senal });
}
// #endregion preguntar-en-flujo
