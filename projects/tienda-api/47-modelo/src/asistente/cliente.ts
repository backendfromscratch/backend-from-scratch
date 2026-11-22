// El cliente de la API de Claude (Fase 11, lección 1): el SDK oficial, @anthropic-ai/sdk, con la
// clave de config.ts. Vive en el servidor, nunca en el navegador: quien tiene la clave gasta a cuenta
// de la tienda, y todo lo que llega al navegador lo puede leer cualquiera.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { type Mensaje, peticionAlModelo } from './conversacion.ts';

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
//   alguien que espera la respuesta delante de la pantalla.
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
// Una pregunta al modelo, con la conversación entera: POST /v1/messages. Los errores del SDK salen
// tal cual: qué hacer con cada uno lo decide la ruta (errores.ts). senal es la señal que cancela la
// llamada: cuando salta (se acaba el tiempo del asistente), el SDK corta la conexión con la API, y
// también deja de esperar entre un intento y el siguiente.
export function preguntar(
  cliente: Anthropic,
  mensajes: Mensaje[],
  senal: AbortSignal,
): Promise<Anthropic.Message> {
  return cliente.messages.create(
    peticionAlModelo(mensajes, instrucciones, { modelo: config.MODELO, esfuerzo: config.ESFUERZO }),
    { signal: senal },
  );
}
// #endregion preguntar
