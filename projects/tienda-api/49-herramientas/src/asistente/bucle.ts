// El bucle de las herramientas (Fase 11, lección 3), escrito a mano para ver que no hay magia: se
// pregunta al modelo; si para porque quiere usar herramientas (stop_reason: tool_use), la tienda
// las ejecuta, le devuelve los resultados y le pregunta otra vez, con todo lo anterior; y así hasta
// que contesta (end_turn). Cada pregunta al modelo es una vuelta. El SDK trae uno hecho (el Tool
// Runner, client.beta.messages.toolRunner), que hace esto mismo por dentro.
//
// No sabe cómo se pregunta (con la respuesta entera o en streaming) ni qué hace cada herramienta:
// se lo dice quien lo usa (ruta.ts), con las funciones de pasos. Así sirve para las dos formas de
// contestar, y los tests lo prueban con funciones de mentira.
import type Anthropic from '@anthropic-ai/sdk';

// #region pasos
// Como mucho, cinco preguntas al modelo por cada pregunta del cliente. Cada vuelta cuesta tokens (la
// conversación entera, otra vez) y tiempo: un modelo que pide herramientas sin parar no puede
// gastar sin límite.
export const VUELTAS_MAXIMAS = 5;

export interface Pasos {
  // Pregunta al modelo con la conversación hasta ahora y devuelve su mensaje entero.
  preguntar(conversacion: Anthropic.MessageParam[]): Promise<Anthropic.Message>;
  // Ejecuta una llamada a una herramienta. Nunca lanza: si falla, su resultado lo dice (is_error).
  ejecutar(llamada: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam>;
  // Opcional: avisa de cada llamada antes de ejecutarla (el streaming manda un evento herramienta).
  alUsar?(llamada: Anthropic.ToolUseBlock): Promise<void>;
}

// Lo que ha pasado: el mensaje del modelo en cada vuelta, en orden (el último es el que acaba), y si
// se ha llegado a VUELTAS_MAXIMAS con el modelo pidiendo aún herramientas.
export interface Resultado {
  mensajes: Anthropic.Message[];
  agotado: boolean;
}
// #endregion pasos

// #region conversar
export async function conversar(
  inicio: Anthropic.MessageParam[],
  pasos: Pasos,
): Promise<Resultado> {
  const conversacion = [...inicio];
  const mensajes: Anthropic.Message[] = [];
  while (true) {
    const mensaje = await pasos.preguntar(conversacion);
    mensajes.push(mensaje);
    // Solo se ejecutan herramientas si el modelo ha parado para eso. Con end_turn ha terminado; con
    // max_tokens se ha quedado sin sitio, quizá con una llamada a medias; con refusal se ha negado.
    // En todos esos casos, la respuesta acaba aquí, sin ejecutar nada.
    if (mensaje.stop_reason !== 'tool_use') return { mensajes, agotado: false };
    if (mensajes.length === VUELTAS_MAXIMAS) return { mensajes, agotado: true };

    // Puede pedir varias a la vez (en paralelo): se ejecutan todas a la vez, con Promise.all.
    const llamadas = mensaje.content.filter((bloque) => bloque.type === 'tool_use');
    for (const llamada of llamadas) await pasos.alUsar?.(llamada);
    const resultados = await Promise.all(llamadas.map((llamada) => pasos.ejecutar(llamada)));

    // A la conversación se añade el mensaje del modelo tal cual, con sus llamadas (y lo que haya
    // pensado), y después un solo mensaje del usuario con todos los resultados. La API no recuerda
    // nada: en la vuelta siguiente se le manda todo otra vez.
    conversacion.push(
      { role: 'assistant', content: mensaje.content },
      { role: 'user', content: resultados },
    );
  }
}
// #endregion conversar
