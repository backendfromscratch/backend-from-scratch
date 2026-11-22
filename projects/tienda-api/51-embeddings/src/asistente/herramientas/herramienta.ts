// Cómo es una herramienta del asistente (Fase 11, lección 3). Una herramienta es una función de la
// tienda que el modelo puede pedir que se ejecute: el modelo no ejecuta nada, solo pide («llama a
// buscar_productos con { consulta: 'taza' }»), y es la tienda la que decide si lo hace y cómo.
import type Anthropic from '@anthropic-ai/sdk';

// #region quien
// Para quién trabaja la herramienta: el cliente de la sesión que ha hecho la pregunta. Lo pone la
// ruta, de la sesión, nunca el modelo: así una herramienta no puede hacer más de lo que podría hacer
// ese cliente, diga lo que diga la conversación.
export interface Quien {
  clienteId: number;
}
// #endregion quien

// #region herramienta
export interface Herramienta {
  // Lo que ve el modelo, con los nombres de la API: el nombre, la descripción (cuándo usarla y qué
  // devuelve) y el JSON Schema de lo que hay que pasarle. Va en cada petición, en tools.
  definicion: Anthropic.Tool;
  // Lo que ve el cliente mientras se ejecuta, en el evento herramienta del streaming: «Buscando
  // productos…». Siempre la misma frase: nunca lo que el modelo le ha pasado.
  etiqueta: string;
  // La función que hace el trabajo. entrada es lo que manda el modelo, sin comprobar: lo primero
  // que hace cada una es leerla con su esquema de Zod. Lo que devuelve va al modelo, en JSON.
  ejecutar(entrada: unknown, quien: Quien): Promise<unknown>;
}
// #endregion herramienta
