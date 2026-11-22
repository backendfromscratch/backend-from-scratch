// La conversación con el modelo, sin hablar con nadie (Fase 11, lecciones 1 y 3): cómo se
// convierte lo que manda el cliente en una petición a la API de mensajes de Claude (la Messages
// API), y cómo se lee lo que contesta. Son funciones puras: los tests las prueban sin red, y
// cliente.ts y ruta.ts las usan.
import type Anthropic from '@anthropic-ai/sdk';
import type { Resultado } from './bucle.ts';
import { type Fuente, origenDe } from './herramientas/herramienta.ts';

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

// Los mensajes del cliente, con los nombres de la API: los roles se llaman user y assistant.
export function mensajesDeLaApi(mensajes: Mensaje[]): Anthropic.MessageParam[] {
  return mensajes.map((mensaje) => ({
    role: mensaje.rol === 'usuario' ? 'user' : 'assistant',
    content: mensaje.texto,
  }));
}

// La petición: el modelo, el tope de tokens, las instrucciones (system), el esfuerzo, las
// herramientas que puede pedir (tools, lección 3) y la conversación entera, porque la API no
// recuerda nada de una petición a la siguiente. Con herramientas, la conversación lleva también
// sus llamadas y sus resultados (bucle.ts). No lleva temperature, top_p ni top_k: los modelos
// actuales los rechazan con un 400.
export function peticionAlModelo(
  conversacion: Anthropic.MessageParam[],
  instrucciones: string,
  ajustes: Ajustes,
  herramientas: Anthropic.Tool[],
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: ajustes.modelo,
    max_tokens: TOKENS_MAXIMOS,
    system: instrucciones,
    output_config: { effort: ajustes.esfuerzo },
    tools: herramientas,
    messages: conversacion,
  };
}
// #endregion peticion

// #region respuesta
// Lo que la tienda responde al cliente (esquemaRespuestaAsistente, en esquemas.ts). fuentes, desde
// la lección 6: las secciones de la ayuda que cita la respuesta.
export interface Respuesta {
  texto: string;
  rechazada: boolean;
  uso: { entrada: number; salida: number };
  fuentes: Fuente[];
}

// Si el modelo se niega a contestar (stop_reason: refusal), la respuesta de la tienda es esta
// frase, siempre la misma, y no lo que el modelo hubiera escrito hasta ahí. En JSON, eso no llega
// nunca al cliente; en streaming (lección 2), sus trozos ya le han llegado según se escribían, y el
// evento fin, con rechazada: true y esta frase, le dice al frontend que los cambie por ella.
export const TEXTO_RECHAZO =
  'Lo siento, con eso no puedo ayudarte. ¿Te ayudo con otra cosa de la tienda?';

// Si el modelo llega a VUELTAS_MAXIMAS pidiendo aún herramientas (bucle.ts), la respuesta acaba con
// esta frase, después de lo que haya escrito.
export const TEXTO_SIN_TERMINAR =
  'Lo siento, no he podido terminar de mirarlo. ¿Me lo preguntas de otra forma?';

// Entre el texto de una vuelta y el de la siguiente (el modelo escribe «Voy a mirarlo.», pide una
// herramienta y, con su resultado, sigue), una línea en blanco: sin ella, las frases saldrían
// pegadas («Voy a mirarlo.Tu pedido…»).
export const SEPARADOR = '\n\n';

// El texto de un mensaje. La respuesta llega como una lista de bloques: de texto, de lo que piensa
// el modelo (thinking), de llamadas a herramientas… Al cliente, solo el texto.
export const textoDe = (mensaje: Anthropic.Message) =>
  mensaje.content.map((bloque) => (bloque.type === 'text' ? bloque.text : '')).join('');

// La respuesta, con los mensajes de todas las vueltas (bucle.ts): el texto de cada una, separados, y
// los tokens que se cobran, sumados (usage, en cada mensaje: cada vuelta se paga entera).
// Con citas (lección 6), el texto de un mensaje llega en varios bloques (uno por cada trozo citado,
// con sus citations): textoDe los junta, y el texto queda igual que sin ellas.
// Las fuentes, las secciones que cita el texto (fuentesCitadas, abajo), de entre las leidas: las que
// ha apuntado ejecutarHerramienta durante la respuesta (herramientas/index.ts). Si el modelo se ha
// negado, ninguna: el texto es la frase fija de la tienda, y no sale de ellas.
export function respuestaDelModelo(
  { mensajes, agotado }: Resultado,
  leidas: Fuente[] = [],
): Respuesta {
  const uso = { entrada: 0, salida: 0 };
  for (const { usage } of mensajes) {
    uso.entrada += usage.input_tokens;
    uso.salida += usage.output_tokens;
  }
  if (mensajes.at(-1)?.stop_reason === 'refusal') {
    return { texto: TEXTO_RECHAZO, rechazada: true, uso, fuentes: [] };
  }
  const textos = mensajes.map(textoDe).filter((texto) => texto !== '');
  if (agotado) textos.push(TEXTO_SIN_TERMINAR);
  const fuentes = sinRepetir(fuentesCitadas(mensajes, leidas));
  return { texto: textos.join(SEPARADOR), rechazada: false, uso, fuentes };
}

// #region fuentes-citadas
// Las secciones que cita la respuesta, en el orden en que las cita. Con las citas encendidas, cada
// trozo de texto que sale de un resultado de búsqueda llega en su propio bloque, con sus citations:
// de qué resultado sale (su source y su title, los que puso la tienda: origenDe). La tienda busca
// cada cita entre las secciones que le dio al modelo (leidas), y la fuente es la suya: una cita que
// no sea de ninguna no cuenta. Un texto que no cita nada (un «no lo sé», un saludo) no tiene
// fuentes, aunque el modelo haya leído tres secciones para escribirlo.
function fuentesCitadas(mensajes: Anthropic.Message[], leidas: Fuente[]): Fuente[] {
  const citadas: Fuente[] = [];
  for (const bloque of mensajes.flatMap((mensaje) => mensaje.content)) {
    if (bloque.type !== 'text') continue;
    for (const cita of bloque.citations ?? []) {
      if (cita.type !== 'search_result_location') continue;
      const fuente = leidas.find((leida) => {
        const { source, title } = origenDe(leida);
        return source === cita.source && title === cita.title;
      });
      if (fuente !== undefined) citadas.push(fuente);
    }
  }
  return citadas;
}
// #endregion fuentes-citadas

// Una fuente es la misma si es la misma sección de la misma página: la primera vez que sale, y
// no más (el modelo puede citar dos veces la misma sección, o buscar dos veces y leerla otra vez).
function sinRepetir(fuentes: Fuente[]): Fuente[] {
  const vistas = new Set<string>();
  return fuentes.filter(({ pagina, seccion }) => {
    const clave = `${pagina}#${seccion}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}
// #endregion respuesta
