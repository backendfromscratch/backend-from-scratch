// buscar_en_ayuda (Fase 11, lección 6): las páginas de ayuda de la tienda, para el asistente. Un
// modelo no sabe nada de esta tienda: si le preguntan cuántos días hay para devolver un producto,
// contestará lo que suelen decir las tiendas, con toda seguridad, y puede que no sea lo de esta (eso
// es una alucinación). Con esta herramienta, antes de contestar busca los trozos de la ayuda que
// tratan de la pregunta (src/ayuda.ts) y contesta con ellos delante. Eso es RAG (Retrieval-Augmented
// Generation, generación aumentada con recuperación): recuperar (buscar los trozos), aumentar
// (ponerlos en la conversación) y generar (que el modelo conteste con ellos). Hecho con una
// herramienta, es el modelo el que decide cuándo hace falta buscar, y qué.
import type Anthropic from '@anthropic-ai/sdk';
import { asc, cosineDistance, desc, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bd } from '../../bd.ts';
import { config } from '../../config.ts';
import { vectores } from '../../embeddings.ts';
import { fragmentosAyuda } from '../../esquema.ts';
import { type Fuente, type Herramienta, origenDe, ResultadosDeBusqueda } from './herramienta.ts';

// #region buscar
// Cuántos trozos devuelve: los k de «los k más cercanos». Con tres secciones cortas, el modelo
// tiene casi siempre lo que necesita, y la conversación no crece mucho (cada token se paga en todas
// las vueltas que quedan).
export const FRAGMENTOS = 3;

// Lo más largo que puede ser el texto de un trozo al devolverlo, en caracteres. Las secciones de la
// ayuda son cortas (la más larga, unos 500), pero una página nueva podría tener una larguísima, y no
// debe llenar la conversación. Las que pasan se cortan, con … al final.
export const MAX_TEXTO = 1500;

// Lo que devuelve la búsqueda de cada trozo: su página, su sección, su texto y la distancia a la
// pregunta (de 0, lo mismo, a 2, lo contrario; null si se ha buscado por palabras, sin medirla).
export interface FragmentoEncontrado extends Fuente {
  texto: string;
  distancia: number | null;
}

const columnas = {
  pagina: fragmentosAyuda.pagina,
  titulo: fragmentosAyuda.titulo,
  seccion: fragmentosAyuda.seccion,
  texto: fragmentosAyuda.texto,
};

const acotar = (texto: string) =>
  texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}…` : texto;

// #region por-significado
// Por el significado, como buscar_productos (lección 5): el vector de la pregunta y los FRAGMENTOS
// trozos más cercanos, con el índice HNSW (migración 015):
//   SELECT …, embedding <=> '[0.021, …]' AS distancia FROM fragmentos_ayuda
//   WHERE embedding IS NOT NULL ORDER BY distancia LIMIT 3
// Siempre devuelve tres, aunque la ayuda no diga nada de la pregunta: los vecinos más cercanos de
// algo siempre existen, aunque estén lejos. Por eso las instrucciones del asistente le piden leerlos
// y decir «no lo sé» si no contestan.
export async function buscarEnAyudaPorSignificado(
  pregunta: string,
): Promise<FragmentoEncontrado[]> {
  const [vector] = await vectores([pregunta]);
  const distancia = cosineDistance(fragmentosAyuda.embedding, vector!).mapWith(Number);
  const filas = await bd
    .select({ ...columnas, distancia })
    .from(fragmentosAyuda)
    .where(isNotNull(fragmentosAyuda.embedding))
    .orderBy(distancia)
    .limit(FRAGMENTOS);
  return filas.map((fila) => ({
    ...fila,
    texto: acotar(fila.texto),
    distancia: Math.round(fila.distancia * 1000) / 1000,
  }));
}
// #endregion por-significado

// Por palabras, con la búsqueda de texto completo de PostgreSQL (full-text search): la que queda
// con BUSQUEDA_SEMANTICA=no, sin modelo. websearch_to_tsquery convierte lo que se busca en una
// consulta (un tsquery), como un buscador web: las palabras, reducidas a su raíz y sin las que no
// dicen nada, unidas con «y»: «devolver producto» es 'devolv' & 'product', y solo encuentra las
// secciones que tienen las dos; con or entre ellas, basta una («devolver or devolución»). @@ dice si
// el tsvector de una fila (la columna busqueda, migración 015) cumple la consulta, con el índice
// GIN, y ts_rank puntúa cuánto: más alto cuantas más veces salen las palabras. En SQL:
//   SELECT … FROM fragmentos_ayuda WHERE busqueda @@ websearch_to_tsquery('spanish', $1)
//   ORDER BY ts_rank(busqueda, websearch_to_tsquery('spanish', $1)) DESC, id LIMIT 3
// No entiende de significados: «¿puedo devolver una taza?» pide las palabras devolver y taza, y
// ninguna sección habla de tazas. A cambio, no necesita ningún modelo, y una lista vacía es «no hay
// nada con esas palabras».
export async function buscarEnAyudaPorPalabras(pregunta: string): Promise<FragmentoEncontrado[]> {
  const consulta = sql`websearch_to_tsquery('spanish', ${pregunta})`;
  const filas = await bd
    .select(columnas)
    .from(fragmentosAyuda)
    .where(sql`${fragmentosAyuda.busqueda} @@ ${consulta}`)
    .orderBy(desc(sql`ts_rank(${fragmentosAyuda.busqueda}, ${consulta})`), asc(fragmentosAyuda.id))
    .limit(FRAGMENTOS);
  return filas.map((fila) => ({ ...fila, texto: acotar(fila.texto), distancia: null }));
}
// #endregion buscar

// #region buscar-en-ayuda
// La que usan el asistente y el servidor MCP (src/mcp.ts): una sola forma de buscar en la ayuda, con
// dos puertas. Por el significado si la búsqueda semántica está encendida y los trozos tienen
// vector; si no (BUSQUEDA_SEMANTICA=no, o una ayuda cargada cuando estaba apagada), por palabras.
export async function consultarAyuda(pregunta: string): Promise<FragmentoEncontrado[]> {
  if (config.BUSQUEDA_SEMANTICA === 'si') {
    const cercanos = await buscarEnAyudaPorSignificado(pregunta);
    if (cercanos.length > 0) return cercanos;
  }
  return buscarEnAyudaPorPalabras(pregunta);
}
// #endregion buscar-en-ayuda

// #region definicion
// Lo que ve el modelo, que cambia con la búsqueda, como la de buscar_productos: por el significado,
// la pregunta puede ser una frase; por palabras, mejor dos o tres palabras clave. En los dos casos,
// en español: las páginas están en español, y la búsqueda por palabras solo entiende ese idioma (el
// modelo de embeddings entiende los dos, pero acierta más con el mismo idioma).
const TEMAS =
  'los envíos y lo que significa cada estado de un pedido, las cancelaciones y devoluciones, los pagos y la cuenta';
const CUANDO = `Úsala siempre que el cliente pregunte cómo funciona algo de la tienda (plazos, costes, devoluciones, cancelaciones, pagos, su cuenta), antes de contestar: las normas de la tienda solo las sabes por aquí. Escribe en español, el idioma de la ayuda, aunque el cliente escriba en otro.`;

export const DESCRIPCION_POR_SIGNIFICADO = `Busca en las páginas de ayuda de la tienda (${TEMAS}) las secciones que tratan de una pregunta, por lo que significa, no solo por sus palabras. ${CUANDO} Devuelve las ${FRAGMENTOS} secciones más parecidas a la pregunta, cada una con su página y su título. Siempre devuelve ${FRAGMENTOS}, aunque ninguna conteste a la pregunta: léelas antes de usarlas, y si no dicen lo que pregunta el cliente, es que la ayuda no lo dice.`;

export const DESCRIPCION_POR_PALABRAS = `Busca en las páginas de ayuda de la tienda (${TEMAS}) las secciones que contienen unas palabras. ${CUANDO} Escribe dos o tres palabras clave, sin artículos (devolver producto, plazo envío): solo encuentra las secciones que tienen todas; con or entre dos palabras, basta una (devolver or devolución). Devuelve como mucho ${FRAGMENTOS} secciones, cada una con su página y su título, las que más tienen esas palabras primero. Si no hay ninguna, prueba con otras palabras antes de decir que la ayuda no lo dice.`;

export const PREGUNTA_POR_SIGNIFICADO =
  'La pregunta del cliente, en español: ¿puedo devolver una taza?';
export const PREGUNTA_POR_PALABRAS = 'Dos o tres palabras clave, en español: devolver producto.';

const porSignificado = config.BUSQUEDA_SEMANTICA === 'si';

const definicion: Anthropic.Tool = {
  name: 'buscar_en_ayuda',
  description: porSignificado ? DESCRIPCION_POR_SIGNIFICADO : DESCRIPCION_POR_PALABRAS,
  input_schema: {
    type: 'object',
    properties: {
      pregunta: {
        type: 'string',
        description: porSignificado ? PREGUNTA_POR_SIGNIFICADO : PREGUNTA_POR_PALABRAS,
      },
    },
    required: ['pregunta'],
    additionalProperties: false,
  },
  strict: true,
};
// #endregion definicion

// #region herramienta
const entrada = z.strictObject({
  pregunta: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .min(1, 'No puede estar vacía')
    .max(300, 'Como máximo, 300 caracteres'),
});

// Si no encuentra nada (por palabras puede pasar; por el significado, solo si la tabla está vacía),
// una frase: la API pide que un resultado sin resultados sea un texto que lo diga.
export const SIN_RESULTADOS = 'La ayuda de la tienda no tiene ninguna sección sobre eso.';

// #region como-resultados
// Cada trozo, como un bloque search_result de la API: source es de dónde sale (aquí, el fichero de
// la página), title su título (el de la página y el de la sección), los dos de origenDe, y content
// su texto. Con citations: { enabled: true }, el modelo cita de qué bloque saca cada frase. La API
// pide que todos los search_result de una petición tengan las citas igual: aquí, siempre encendidas.
export function comoResultados(fragmentos: FragmentoEncontrado[]): ResultadosDeBusqueda {
  return new ResultadosDeBusqueda(
    fragmentos.map((fragmento) => {
      const { source, title } = origenDe(fragmento);
      return {
        type: 'search_result',
        source,
        title,
        content: [{ type: 'text', text: fragmento.texto }],
        citations: { enabled: true },
      };
    }),
    fragmentos.map(({ pagina, titulo, seccion }) => ({ pagina, titulo, seccion })),
  );
}
// #endregion como-resultados

export const buscarEnAyuda: Herramienta = {
  definicion,
  etiqueta: 'Buscando en la ayuda…',
  async ejecutar(datos) {
    const { pregunta } = entrada.parse(datos);
    const fragmentos = await consultarAyuda(pregunta);
    return fragmentos.length === 0 ? SIN_RESULTADOS : comoResultados(fragmentos);
  },
};
// #endregion herramienta
