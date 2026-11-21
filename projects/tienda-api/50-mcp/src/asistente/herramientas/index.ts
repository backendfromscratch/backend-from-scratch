// Las herramientas del asistente (Fase 11, lección 3), todas juntas: las que se le ofrecen al
// modelo en cada petición y la función que ejecuta la que pida. Añadir una herramienta es escribir
// su fichero, como buscar-productos.ts, y ponerla en esta lista.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from '../../log.ts';
import { buscarProductos } from './buscar-productos.ts';
import type { Herramienta, Quien } from './herramienta.ts';
import { verPedido } from './ver-pedido.ts';

// #region lista
export const HERRAMIENTAS: Herramienta[] = [buscarProductos, verPedido];

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
export async function ejecutarHerramienta(
  llamada: Anthropic.ToolUseBlock,
  quien: Quien,
  requestId: string,
): Promise<Anthropic.ToolResultBlockParam> {
  // Una línea en el log por llamada: cuál y si ha fallado. Lo que le ha pasado el modelo, no: sale
  // de la conversación, que es del cliente.
  const resultado = (contenido: unknown, error = false): Anthropic.ToolResultBlockParam => {
    log.info({ requestId, herramienta: llamada.name, error }, 'el asistente usa una herramienta');
    return {
      type: 'tool_result',
      tool_use_id: llamada.id,
      content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido),
      ...(error ? { is_error: true } : {}),
    };
  };

  const herramienta = porNombre(llamada.name);
  if (herramienta === undefined) return resultado(`No existe la herramienta ${llamada.name}`, true);
  try {
    return resultado(await herramienta.ejecutar(llamada.input, quien));
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
