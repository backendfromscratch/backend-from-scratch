// La descripción de un producto, escrita por el modelo (Fase 11, lección 7). Es trabajo largo: una
// llamada al modelo tarda unos segundos, y puede fallar (un 429, un 529, un corte) y haber que
// repetirla. Por eso no la hace la API mientras un administrador espera, sino el trabajador, con
// la cola (cola.ts): si falla, BullMQ la vuelve a intentar (OPCIONES_TRABAJOS: cinco intentos, con
// 1, 2, 4 y 8 segundos entre uno y otro), además de los reintentos del propio SDK
// (MODELO_REINTENTOS, config.ts). La encarga POST /v2/productos/{id}/descripcion (v2.ts), con un
// evento saliente (encargarDescripcion, en datos.ts).
// Para muchos productos de una vez, la API de Claude tiene otra puerta: Message Batches, que hace
// las peticiones a mitad de precio y devuelve los resultados en menos de 24 horas. Para uno, que
// alguien pide ahora, la cola basta.
import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { actualizarProducto, buscarProducto, type Producto } from '../datos.ts';
import { esquemaDescripcion } from '../esquemas.ts';
import { log } from '../log.ts';
import { cliente } from './cliente.ts';
import { TOKENS_MAXIMOS, textoDe } from './conversacion.ts';
import { apuntarLlamada } from './coste.ts';

// #region peticion
// Sus instrucciones, en su fichero, como las del asistente: qué es una buena descripción y qué no
// puede inventarse.
const instrucciones = readFileSync(new URL('descripcion.md', import.meta.url), 'utf8');

// Una sola llamada, sin herramientas: todo lo que el modelo necesita va en la petición. Los datos
// del producto, en JSON, en el mensaje del usuario: así no se mezclan con las instrucciones. Con el
// mismo modelo y el mismo esfuerzo que el asistente (config.ts).
export function peticionDeDescripcion(
  producto: Producto,
): Anthropic.MessageCreateParamsNonStreaming {
  const { nombre, precioCentimos, categorias, descripcion } = producto;
  return {
    model: config.MODELO,
    max_tokens: TOKENS_MAXIMOS,
    system: instrucciones,
    output_config: { effort: config.ESFUERZO },
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ nombre, precioCentimos, categorias, descripcion }),
      },
    ],
  };
}
// #endregion peticion

// #region escribir
// El trabajo: lee el producto, pide la descripción y la guarda. Si el modelo falla, el error del
// SDK sale de aquí y el trabajo falla: la cola lo repetirá. La descripción se comprueba con el mismo
// esquema que la que escribe un administrador a mano (esquemas.ts: de 1 a 500 caracteres): lo que
// escribe el modelo es otra entrada más, y no se guarda sin mirarla. Si no vale (vacía, demasiado
// larga, cortada por max_tokens), también falla: otro intento puede salir bien.
// Guardarla con actualizarProducto (datos.ts) hace lo de cualquier cambio de descripción: borra su
// vector y apunta el evento para calcular el nuevo (lección 5), y la quita de la caché.
export async function escribirDescripcion(productoId: number): Promise<void> {
  // La ruta no encarga nada sin clave; pero el trabajador podría arrancar con otra configuración.
  // Repetirlo no lo arreglaría: se dice en el log, y el trabajo se da por hecho.
  if (cliente === undefined) {
    log.warn({ productoId }, 'sin ANTHROPIC_API_KEY: no se puede escribir la descripción');
    return;
  }
  const producto = await buscarProducto(productoId);
  if (producto === undefined) {
    log.info({ productoId }, 'el producto ya no existe: no hay descripción que escribir');
    return;
  }
  // Como mucho, lo mismo que espera la tienda una respuesta del asistente: un trabajo colgado no
  // debe ocupar al trabajador para siempre.
  const mensaje = await cliente.messages.create(peticionDeDescripcion(producto), {
    signal: AbortSignal.timeout(config.ASISTENTE_TIEMPO_MAXIMO_MS),
  });
  // Lo que ha costado, al log y a las métricas, como las llamadas del asistente (coste.ts). Sin
  // presupuesto: lo encarga un administrador, no un cliente.
  apuntarLlamada(mensaje, { trabajo: 'descripcion-de-producto', productoId });
  // #region comprobar-descripcion
  // Una negativa no se arregla repitiendo: se apunta, y el producto se queda como estaba.
  if (mensaje.stop_reason === 'refusal') {
    log.warn(
      { productoId, mensaje: mensaje.id },
      'el modelo se ha negado a escribir la descripción',
    );
    return;
  }
  const leida = esquemaDescripcion.safeParse(textoDe(mensaje));
  if (mensaje.stop_reason !== 'end_turn' || !leida.success) {
    throw new Error(
      `el modelo no ha escrito una descripción que valga (stop_reason: ${mensaje.stop_reason})`,
    );
  }
  await actualizarProducto(productoId, { descripcion: leida.data });
  log.info({ productoId, mensaje: mensaje.id }, 'descripción escrita');
  // #endregion comprobar-descripcion
}
// #endregion escribir
