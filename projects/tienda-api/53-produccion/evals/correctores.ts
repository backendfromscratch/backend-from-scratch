// Los correctores de las evals (Fase 11, lección 7): cada uno mira una cosa de lo que ha hecho el
// asistente en un caso (qué herramientas ha usado y con qué, qué ha contestado, qué fuentes ha
// leído) y dice si está bien, y por qué no. Casi todos son código: comprueban algo exacto, siempre
// igual, gratis. Uno, juez, le pregunta a otro modelo: para lo que el código no sabe mirar (si una
// recomendación tiene sentido, si el tono es el de la tienda).
import { isDeepStrictEqual } from 'node:util';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { type Uso, usoDe } from '../src/asistente/coste.ts';
import { config } from '../src/config.ts';
import type { Ejecucion } from './evaluar.ts';

// #region corrector
// Lo que dice un corrector: si está bien y, si no, por qué. uso: los tokens que ha gastado él (solo
// el juez, que llama al modelo), para sumarlos al coste del caso.
export interface Nota {
  correcto: boolean;
  motivo: string;
  uso?: Uso;
}

export interface Corrector {
  // Qué mira, para la tabla y para los fallos: «llama a ver_pedido con {"id":21}».
  descripcion: string;
  // true si lo decide un modelo (LLM-as-judge), y no el código: la tabla lo dice.
  juez?: boolean;
  corregir(ejecucion: Ejecucion, cliente: Anthropic): Nota | Promise<Nota>;
}
// #endregion corrector

// #region codigo
// Ha usado esa herramienta, alguna vez. Con entrada, además, con esa entrada exacta (comparada como
// datos, no como texto: {"id":21} es lo mismo con espacios o sin ellos).
export function llamaA(nombre: string, entrada?: Record<string, unknown>): Corrector {
  const descripcion =
    entrada === undefined
      ? `llama a ${nombre}`
      : `llama a ${nombre} con ${JSON.stringify(entrada)}`;
  return {
    descripcion,
    corregir({ llamadas }) {
      const suyas = llamadas.filter((llamada) => llamada.nombre === nombre);
      if (suyas.length === 0) return { correcto: false, motivo: `no ha llamado a ${nombre}` };
      if (entrada === undefined) return { correcto: true, motivo: '' };
      const exacta = suyas.some((llamada) => isDeepStrictEqual(llamada.entrada, entrada));
      const usadas = suyas.map((llamada) => JSON.stringify(llamada.entrada)).join(', ');
      return { correcto: exacta, motivo: exacta ? '' : `la ha llamado con ${usadas}` };
    },
  };
}

// La respuesta no dice nada de esto: para los datos que no debe dar (los de un pedido de otro).
export function noMenciona(...patrones: RegExp[]): Corrector {
  return {
    descripcion: `no menciona ${patrones.join(' ni ')}`,
    corregir({ respuesta }) {
      const dicho = patrones.find((patron) => patron.test(respuesta.texto));
      return dicho === undefined
        ? { correcto: true, motivo: '' }
        : { correcto: false, motivo: `la respuesta dice ${dicho}: «${respuesta.texto}»` };
    },
  };
}

// La respuesta dice esto: un dato que tiene que estar (el precio, el plazo).
export function menciona(patron: RegExp): Corrector {
  return {
    descripcion: `menciona ${patron}`,
    corregir({ respuesta }) {
      return patron.test(respuesta.texto)
        ? { correcto: true, motivo: '' }
        : { correcto: false, motivo: `la respuesta no lo dice: «${respuesta.texto}»` };
    },
  };
}

// #region dice-que-no-lo-sabe
// Dice que no lo sabe, como le piden las instrucciones cuando la ayuda no contesta: que la ayuda no
// lo dice, o el correo de soporte. Con palabras distintas cada vez (el modelo no repite frases), así
// que busca las formas más corrientes de decirlo; si un día lo dice de otra, el fallo enseña la
// respuesta, y se añade aquí.
const NO_LO_SABE =
  /soporte@tienda\.example|no (lo )?s[ée]\b|no (lo )?(dice|indica|menciona|recoge)|no (tengo|encuentro|aparece|hay) (esa |ninguna |nada|informaci)/i;

export function diceQueNoLoSabe(): Corrector {
  return {
    descripcion: 'dice que no lo sabe',
    corregir({ respuesta }) {
      return NO_LO_SABE.test(respuesta.texto)
        ? { correcto: true, motivo: '' }
        : { correcto: false, motivo: `no dice que no lo sepa: «${respuesta.texto}»` };
    },
  };
}
// #endregion dice-que-no-lo-sabe

// Cita esa página de la ayuda: está en sus fuentes, las secciones que cita la respuesta (con las
// citas que pone la API, que la tienda busca entre lo que devolvió buscar_en_ayuda). Haberla leído
// no basta: una respuesta que no la cita no se puede comprobar.
export function conFuente(pagina: string): Corrector {
  return {
    descripcion: `fuentes tiene la página ${pagina}`,
    corregir({ respuesta }) {
      const paginas = respuesta.fuentes.map((fuente) => fuente.pagina);
      return paginas.includes(pagina)
        ? { correcto: true, motivo: '' }
        : { correcto: false, motivo: `fuentes: [${paginas.join(', ')}]` };
    },
  };
}
// #endregion codigo

// #region juez
// LLM-as-judge: otro modelo lee la pregunta, la respuesta y una rúbrica corta, y dice si la cumple.
// Sirve para lo que el código no sabe mirar, pero tiene sus límites, y hay que saberlos:
//   - también se equivoca, y no siempre igual: el mismo caso puede pasar hoy y fallar mañana;
//   - aquí es el mismo modelo que el asistente (MODELO), el más barato, y un modelo tiende a dar
//     por buenas respuestas como las suyas;
//   - cuesta tokens, como cualquier llamada.
// Por eso solo un caso lo usa, con una rúbrica concreta (cosas que se pueden comprobar, no «¿es una
// buena respuesta?»), y un fallo del juez se mira a mano antes de creérselo.
// La respuesta, con salidas estructuradas (structured outputs): output_config.format con un
// esquema, y la API garantiza que el texto es un JSON que lo cumple. El SDK lo lee con Zod
// (messages.parse y zodOutputFormat) y lo deja en parsed_output.
const veredicto = z.object({ cumple: z.boolean(), motivo: z.string() });

const INSTRUCCIONES_JUEZ = `Evalúas las respuestas del asistente de una tienda online. Te llegan la pregunta de un cliente, la respuesta del asistente y una rúbrica. Di si la respuesta cumple todos los puntos de la rúbrica (cumple) y, en una frase, por qué (motivo). Sé estricto: si un punto no se cumple, o no estás seguro de que se cumpla, la respuesta no cumple.`;

export function juez(rubrica: string): Corrector {
  return {
    descripcion: `juez: ${rubrica}`,
    juez: true,
    async corregir({ pregunta, respuesta }, cliente) {
      const mensaje = await cliente.messages.parse({
        model: config.MODELO,
        max_tokens: 1024,
        system: INSTRUCCIONES_JUEZ,
        output_config: { effort: 'low', format: zodOutputFormat(veredicto) },
        messages: [
          {
            role: 'user',
            content: `Rúbrica:\n${rubrica}\n\nPregunta del cliente:\n${pregunta}\n\nRespuesta del asistente:\n${respuesta.texto}`,
          },
        ],
      });
      const uso = usoDe(mensaje.usage);
      const leido = mensaje.parsed_output;
      if (!leido) return { correcto: false, motivo: 'el juez no ha dado un veredicto', uso };
      return { correcto: leido.cumple, motivo: leido.motivo, uso };
    },
  };
}
// #endregion juez
