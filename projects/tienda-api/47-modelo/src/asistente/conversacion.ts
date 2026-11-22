// La conversación con el modelo, sin hablar con nadie (Fase 11, lección 1): cómo se convierte lo
// que manda el cliente en una petición a la API de mensajes de Claude (la Messages API), y cómo se
// lee lo que contesta. Son funciones puras: los tests las prueban sin red, y cliente.ts y ruta.ts
// las usan.
import type Anthropic from '@anthropic-ai/sdk';

// #region mensaje
// Un mensaje de la conversación, como lo manda el frontend de la tienda (esquemas.ts): quién lo dice
// y qué dice.
export interface Mensaje {
  rol: 'usuario' | 'asistente';
  texto: string;
}

// Lo que se elige en config.ts: el modelo y cuánto se esfuerza.
export interface Ajustes {
  modelo: string;
  esfuerzo: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}
// #endregion mensaje

// #region peticion
// Lo más larga que puede ser una respuesta, en tokens (un token es un trozo de palabra). Una
// respuesta corta son unos cientos; el resto deja sitio a lo que el modelo piensa antes de
// contestar, que también cuenta. Si llega al tope, la respuesta se corta (stop_reason: max_tokens).
export const TOKENS_MAXIMOS = 2048;

// La petición: el modelo, el tope de tokens, las instrucciones (system), el esfuerzo y la
// conversación entera, porque la API no recuerda nada de una petición a la siguiente. Los roles de
// la API se llaman user y assistant. No lleva temperature, top_p ni top_k: los modelos actuales
// los rechazan con un 400.
export function peticionAlModelo(
  mensajes: Mensaje[],
  instrucciones: string,
  ajustes: Ajustes,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: ajustes.modelo,
    max_tokens: TOKENS_MAXIMOS,
    system: instrucciones,
    output_config: { effort: ajustes.esfuerzo },
    messages: mensajes.map((mensaje) => ({
      role: mensaje.rol === 'usuario' ? 'user' : 'assistant',
      content: mensaje.texto,
    })),
  };
}
// #endregion peticion

// #region respuesta
// Lo que la tienda responde al cliente (esquemaRespuestaAsistente, en esquemas.ts).
export interface Respuesta {
  texto: string;
  rechazada: boolean;
  uso: { entrada: number; salida: number };
}

// Si el modelo se niega a contestar (stop_reason: refusal), la tienda no enseña lo que hubiera
// escrito hasta ahí: contesta esta frase, siempre la misma.
export const TEXTO_RECHAZO =
  'Lo siento, con eso no puedo ayudarte. ¿Te ayudo con otra cosa de la tienda?';

// La respuesta llega como una lista de bloques: de texto, de lo que piensa el modelo (thinking), de
// herramientas (lección 3)… Al cliente, solo el texto. Y en usage, los tokens que se cobran.
export function respuestaDelModelo(mensaje: Anthropic.Message): Respuesta {
  const uso = { entrada: mensaje.usage.input_tokens, salida: mensaje.usage.output_tokens };
  if (mensaje.stop_reason === 'refusal') return { texto: TEXTO_RECHAZO, rechazada: true, uso };
  const texto = mensaje.content
    .map((bloque) => (bloque.type === 'text' ? bloque.text : ''))
    .join('');
  return { texto, rechazada: false, uso };
}
// #endregion respuesta
