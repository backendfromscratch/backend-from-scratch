// El que corre las evals (Fase 11, lección 7). Una eval es un test para algo que no contesta
// siempre lo mismo: el asistente. Cada caso es una pregunta de un cliente; el asistente la contesta
// como en la tienda (las mismas instrucciones, las mismas herramientas, el mismo modelo), y unos
// correctores (correctores.ts) miran lo que ha hecho. Al final, una tabla: qué casos pasan, cuántos
// tokens han gastado y cuánto han costado. Después de cambiar las instrucciones, una herramienta o
// el modelo, se pasan otra vez, y se ve si el cambio ha mejorado o empeorado el asistente.
// Se ejecuta dentro del proceso, sin HTTP: así ve lo que no sale en la respuesta de la ruta, qué
// herramientas ha pedido el modelo y con qué. No pasa por los límites de preguntas ni por el
// presupuesto: lo ejecuta quien lleva la tienda, no un cliente. Lo arranca ejecutar.ts (npm run
// evals), contra el modelo de verdad; test/evals.test.ts, contra el modelo falso.
import type Anthropic from '@anthropic-ai/sdk';
import { conversar } from '../src/asistente/bucle.ts';
import { preguntar } from '../src/asistente/cliente.ts';
import {
  mensajesDeLaApi,
  type Respuesta,
  respuestaDelModelo,
} from '../src/asistente/conversacion.ts';
import {
  costeEnDolares,
  precioDe,
  SIN_USO,
  sumarUso,
  tokensDe,
  type Uso,
  usoDe,
} from '../src/asistente/coste.ts';
import type { Fuente, Quien } from '../src/asistente/herramientas/herramienta.ts';
import { ejecutarHerramienta } from '../src/asistente/herramientas/index.ts';
import { config } from '../src/config.ts';
import type { Corrector } from './correctores.ts';

// #region tipos
// Un caso: un nombre corto, la pregunta del cliente y lo que se comprueba.
export interface Caso {
  id: string;
  pregunta: string;
  correctores: Corrector[];
}

// Una llamada a una herramienta durante el caso: cuál, con qué entrada y qué devolvió.
export interface Llamada {
  nombre: string;
  entrada: unknown;
  resultado: Anthropic.ToolResultBlockParam;
}

// Lo que ha pasado en un caso: lo que ve el cliente (la respuesta, con sus fuentes), lo que no ve
// (las llamadas a herramientas) y los tokens de todas las vueltas.
export interface Ejecucion {
  pregunta: string;
  respuesta: Respuesta;
  llamadas: Llamada[];
  uso: Uso;
}

export interface ResultadoCaso {
  id: string;
  juez: boolean;
  aprobado: boolean;
  fallos: string[];
  tokens: number;
  costeUsd: number;
}
// #endregion tipos

// #region ejecutar-caso
// La pregunta, contestada como en la ruta (asistente/ruta.ts, sin streaming): el mismo bucle, la
// misma petición (cliente.ts, con su caché) y las mismas herramientas, que trabajan para quien (el
// cliente de práctica). Cada llamada a una herramienta se apunta antes de devolverla al bucle.
export async function ejecutarCaso(
  caso: Caso,
  cliente: Anthropic,
  quien: Quien,
): Promise<Ejecucion> {
  const llamadas: Llamada[] = [];
  const leidas: Fuente[] = [];
  let uso = SIN_USO;
  const senal = AbortSignal.timeout(config.ASISTENTE_TIEMPO_MAXIMO_MS);
  const resultado = await conversar(mensajesDeLaApi([{ rol: 'usuario', texto: caso.pregunta }]), {
    preguntar: async (conversacion) => {
      const mensaje = await preguntar(cliente, conversacion, senal);
      uso = sumarUso(uso, usoDe(mensaje.usage));
      return mensaje;
    },
    ejecutar: async (llamada) => {
      const resultado = await ejecutarHerramienta(llamada, quien, `eval-${caso.id}`, leidas);
      llamadas.push({ nombre: llamada.name, entrada: llamada.input, resultado });
      return resultado;
    },
  });
  return {
    pregunta: caso.pregunta,
    respuesta: respuestaDelModelo(resultado, leidas),
    llamadas,
    uso,
  };
}
// #endregion ejecutar-caso

// #region evaluar
// Todos los casos, uno detrás de otro (a la vez irían más deprisa, pero chocarían antes con los
// límites de la API, y la tabla saldría en otro orden cada vez), y sus correctores. Un caso que
// falla con un error (la API no contesta, por ejemplo) no para los demás: sale como no aprobado,
// con el error. El coste de cada caso incluye el del juez, si lo tiene.
export async function evaluar(
  casos: Caso[],
  { cliente, quien }: { cliente: Anthropic; quien: Quien },
): Promise<ResultadoCaso[]> {
  const resultados: ResultadoCaso[] = [];
  for (const caso of casos) {
    const juez = caso.correctores.some((corrector) => corrector.juez === true);
    let uso = SIN_USO;
    const fallos: string[] = [];
    try {
      const ejecucion = await ejecutarCaso(caso, cliente, quien);
      uso = ejecucion.uso;
      for (const corrector of caso.correctores) {
        const nota = await corrector.corregir(ejecucion, cliente);
        if (nota.uso) uso = sumarUso(uso, nota.uso);
        if (!nota.correcto) fallos.push(`${corrector.descripcion}: ${nota.motivo}`);
      }
    } catch (error) {
      fallos.push(`error: ${(error as Error).message}`);
    }
    resultados.push({
      id: caso.id,
      juez,
      aprobado: fallos.length === 0,
      fallos,
      tokens: tokensDe(uso),
      costeUsd: costeEnDolares(uso, precioDe(config.MODELO)),
    });
  }
  return resultados;
}
// #endregion evaluar

// #region tabla
// La tabla, como texto: una fila por caso (si lo decide el código o el juez, si pasa, sus tokens y
// su coste), debajo de cada uno que falla, por qué, y al final, el total.
export function tabla(resultados: ResultadoCaso[]): string {
  const ancho = Math.max(4, ...resultados.map((resultado) => resultado.id.length));
  const fila = (columnas: string[]) =>
    [
      columnas[0]!.padEnd(ancho),
      columnas[1]!.padEnd(6),
      columnas[2]!.padEnd(6),
      columnas[3]!.padStart(7),
      columnas[4]!.padStart(10),
    ].join('  ');
  const lineas = [fila(['caso', 'cómo', 'pasa', 'tokens', 'coste ($)'])];
  for (const resultado of resultados) {
    lineas.push(
      fila([
        resultado.id,
        resultado.juez ? 'juez' : 'código',
        resultado.aprobado ? 'sí' : 'NO',
        String(resultado.tokens),
        resultado.costeUsd.toFixed(6),
      ]),
    );
    for (const fallo of resultado.fallos) lineas.push(`    - ${fallo}`);
  }
  const aprobados = resultados.filter((resultado) => resultado.aprobado).length;
  const tokens = resultados.reduce((suma, resultado) => suma + resultado.tokens, 0);
  const coste = resultados.reduce((suma, resultado) => suma + resultado.costeUsd, 0);
  lineas.push(
    '',
    `Pasan ${aprobados} de ${resultados.length}. En total: ${tokens} tokens, ${coste.toFixed(6)} $ (${config.MODELO}).`,
  );
  return lineas.join('\n');
}
// #endregion tabla
