// Las herramientas del asistente (Fase 11, lección 3), todas juntas: las que se le ofrecen al
// modelo en cada petición y la función que ejecuta la que pida. Añadir una herramienta es escribir
// su fichero, como buscar-productos.ts, y ponerla en esta lista.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from '../../log.ts';
import { buscarEnAyuda } from './buscar-en-ayuda.ts';
import { buscarProductos } from './buscar-productos.ts';
import { type Fuente, type Herramienta, type Quien, ResultadosDeBusqueda } from './herramienta.ts';
import { verPedido } from './ver-pedido.ts';

// #region lista
// buscar_en_ayuda, desde la lección 6.
export const HERRAMIENTAS: Herramienta[] = [buscarProductos, verPedido, buscarEnAyuda];

// Lo que va en cada petición al modelo, en tools: las definiciones, siempre en el mismo orden.
export const definiciones = HERRAMIENTAS.map((herramienta) => herramienta.definicion);

const porNombre = (nombre: string) =>
  HERRAMIENTAS.find((herramienta) => herramienta.definicion.name === nombre);

// Lo que ve el cliente mientras se ejecuta (el evento herramienta). Si el modelo pide una que no
// existe, no se ejecuta nada, pero el cliente ve que el asistente está en ello.
export const etiquetaDe = (nombre: string) =>
  porNombre(nombre)?.etiqueta ?? 'Consultando la tienda…';
// #endregion lista

// #region ejecutar
// Ejecuta la herramienta que ha pedido el modelo y devuelve su resultado como lo espera la API: un
// bloque tool_result con el id de la llamada (tool_use_id), para que el modelo sepa a qué llamada
// responde. Nunca lanza un error: si la herramienta no existe, si su entrada no vale o si falla, el
// resultado lleva is_error: true y una frase corta que dice qué ha pasado, y el modelo decide qué
// hacer (corregir la entrada, probar otra cosa o decírselo al cliente). Un error lanzado aquí
// tiraría la respuesta entera por una sola herramienta.
// Desde la lección 6, leidas: las secciones de la ayuda que el modelo ha recibido en esta
// respuesta, que la ruta lleva de una llamada a otra. Si la herramienta devuelve
// ResultadosDeBusqueda (buscar_en_ayuda), sus fuentes se apuntan ahí, y sus bloques search_result
// van al modelo tal cual, sin pasar por JSON. Las fuentes de la respuesta salen de ahí: las que cite.
export async function ejecutarHerramienta(
  llamada: Anthropic.ToolUseBlock,
  quien: Quien,
  requestId: string,
  leidas: Fuente[] = [],
): Promise<Anthropic.ToolResultBlockParam> {
  // Una línea en el log por llamada: cuál y si ha fallado. Lo que le ha pasado el modelo, no: sale
  // de la conversación, que es del cliente.
  const resultado = (
    contenido: Anthropic.ToolResultBlockParam['content'],
    error = false,
  ): Anthropic.ToolResultBlockParam => {
    log.info({ requestId, herramienta: llamada.name, error }, 'el asistente usa una herramienta');
    return {
      type: 'tool_result',
      tool_use_id: llamada.id,
      content: contenido,
      ...(error ? { is_error: true } : {}),
    };
  };

  const herramienta = porNombre(llamada.name);
  if (herramienta === undefined) return resultado(`No existe la herramienta ${llamada.name}`, true);
  try {
    const salida = await herramienta.ejecutar(llamada.input, quien);
    if (salida instanceof ResultadosDeBusqueda) {
      leidas.push(...salida.fuentes);
      return resultado(salida.bloques);
    }
    return resultado(typeof salida === 'string' ? salida : JSON.stringify(salida));
  } catch (error) {
    // La entrada no cumple su esquema de Zod: qué campo falla y por qué, para que el modelo pueda
    // corregirla en la vuelta siguiente.
    if (error instanceof z.ZodError) {
      const fallos = error.issues.map(({ path, message }) =>
        path.length > 0 ? `${path.join('.')}: ${message}` : message,
      );
      return resultado(`La entrada no vale. ${fallos.join('; ')}`, true);
    }
    // Cualquier otro fallo (la base de datos no contesta, un error de programación): al log,
    // entero; al modelo, nada de lo que ha pasado dentro.
    log.error(
      { err: error, requestId, herramienta: llamada.name },
      'una herramienta del asistente ha fallado',
    );
    return resultado('La herramienta ha fallado: ahora no se puede consultar.', true);
  }
}
// #endregion ejecutar
