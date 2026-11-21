// buscar_productos (Fase 11, lección 3): el catálogo, para el asistente. En la lección 3 buscaba por
// el nombre; desde la lección 5 busca por el significado («algo para el frío» encuentra la bufanda
// y los guantes, aunque no compartan ni una palabra), con los vectores de los productos y pgvector.
// Con BUSQUEDA_SEMANTICA=no, sigue buscando por el nombre.
import type Anthropic from '@anthropic-ai/sdk';
import { and, asc, cosineDistance, ilike, isNotNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { bd } from '../../bd.ts';
import { config } from '../../config.ts';
import { vectores } from '../../embeddings.ts';
import { productos } from '../../esquema.ts';
import type { Herramienta } from './herramienta.ts';

// #region buscar
// Cuántos productos devuelve como mucho: lo que devuelve una herramienta entra en la conversación, y
// cada token de la conversación se paga en todas las vueltas que quedan.
export const MAX_PRODUCTOS = 10;

// De cada producto, lo justo para contestar: sin las categorías, que el modelo no necesita. Desde
// la lección 5, con su descripción (de lo que trata, para que el modelo sepa si le sirve al
// cliente) y la distancia a la consulta: de 0 (lo mismo) a 2 (lo contrario), o null si no se ha
// medido (la búsqueda por el nombre, o un producto que aún no tiene vector).
export interface ProductoEncontrado {
  id: number;
  nombre: string;
  descripcion: string | null;
  precioCentimos: number;
  stock: number;
  distancia: number | null;
}

const columnas = {
  id: productos.id,
  nombre: productos.nombre,
  descripcion: productos.descripcion,
  precioCentimos: productos.precioCentimos,
  stock: productos.stock,
};

// Los productos cuyo nombre contiene la consulta, sin importar mayúsculas: ILIKE, el LIKE de
// PostgreSQL que no distingue entre «Taza» y «taza». La búsqueda de la lección 3, la que queda con
// BUSQUEDA_SEMANTICA=no.
export async function buscarProductosPorNombre(consulta: string): Promise<ProductoEncontrado[]> {
  const filas = await bd
    .select(columnas)
    .from(productos)
    .where(conElNombre(consulta))
    .orderBy(asc(productos.id))
    .limit(MAX_PRODUCTOS);
  return filas.map((fila) => ({ ...fila, distancia: null }));
}

const conElNombre = (consulta: string) => ilike(productos.nombre, `%${sinComodines(consulta)}%`);

// En un LIKE, % es «cualquier cosa» y _ es «una letra cualquiera». Lo que busca el modelo es texto,
// no un patrón: delante de cada uno (y de la \, que es la que escapa) va una \, y cuentan como lo
// que son. Sin esto, una consulta «%» devolvería el catálogo entero.
const sinComodines = (texto: string) => texto.replace(/[\\%_]/g, '\\$&');
// #endregion buscar

// #region por-significado
// Cuántos vecinos más cercanos devuelve la búsqueda por el significado: la k de «los k más
// cercanos». Siempre devuelve k, aunque los últimos ya no se parezcan en nada: los vectores no
// saben decir «no hay ninguno», y por eso va la distancia, para que el modelo juzgue.
export const CERCANOS = 5;

// La búsqueda por el significado, en tres pasos:
//   1. El vector de la consulta, con el mismo modelo que los de los productos (la API solo calcula
//      este; los de los productos los calcula el trabajador).
//   2. Los productos que tienen la consulta en el nombre, como en la lección 3, primero. Un modelo
//      de embeddings entiende frases, pero no tanto una palabra suelta: medido el 2026-11-21, para
//      «taza», la Taza ni siquiera salía entre los cinco más cercanos. Juntar las dos búsquedas
//      (por las palabras y por el significado) se llama búsqueda híbrida. Así tampoco se pierden
//      los productos que aún no tienen vector: si su nombre coincide, salen aquí (con distancia
//      null, porque no se puede medir).
//   3. Después, los CERCANOS productos cuyo vector está más cerca, sin repetir los de antes, con
//      la distancia del coseno. En SQL:
//        SELECT …, embedding <=> '[0.021, -0.043, …]' AS distancia FROM productos
//        WHERE embedding IS NOT NULL AND id NOT IN (2) ORDER BY distancia LIMIT 5
//      cosineDistance es el <=> de pgvector escrito con Drizzle. ORDER BY por esa distancia, con
//      LIMIT, es lo que el índice HNSW (migración 014) sabe hacer sin mirar toda la tabla.
export async function buscarProductosPorSignificado(
  consulta: string,
): Promise<ProductoEncontrado[]> {
  // #region por-el-nombre-primero
  const [vector] = await vectores([consulta]);
  // Un producto sin vector da NULL, y Drizzle no le pasa NULL a mapWith: se queda en null.
  const distancia = cosineDistance(productos.embedding, vector!).mapWith(Number);
  const porElNombre = await bd
    .select({ ...columnas, distancia })
    .from(productos)
    .where(conElNombre(consulta))
    .orderBy(asc(productos.id))
    .limit(MAX_PRODUCTOS);
  const yaEstan = porElNombre.map((producto) => producto.id);
  // #endregion por-el-nombre-primero
  // #region cercanos
  const cercanos = await bd
    .select({ ...columnas, distancia })
    .from(productos)
    .where(
      and(
        isNotNull(productos.embedding),
        yaEstan.length > 0 ? notInArray(productos.id, yaEstan) : undefined,
      ),
    )
    .orderBy(distancia)
    .limit(CERCANOS);
  // #endregion cercanos
  // La distancia, con tres decimales: más no le dice nada al modelo, y cada cifra es un token.
  return [...porElNombre, ...cercanos].map((producto) => ({
    ...producto,
    distancia: producto.distancia === null ? null : Math.round(producto.distancia * 1000) / 1000,
  }));
}
// #endregion por-significado

// #region buscar-en-catalogo
// La que usan el asistente y el servidor MCP (src/mcp.ts): una sola forma de buscar, con dos
// puertas. Por el significado si la búsqueda semántica está encendida; si no, por el nombre.
export function buscarEnCatalogo(consulta: string): Promise<ProductoEncontrado[]> {
  return config.BUSQUEDA_SEMANTICA === 'si'
    ? buscarProductosPorSignificado(consulta)
    : buscarProductosPorNombre(consulta);
}
// #endregion buscar-en-catalogo

// #region definicion
// Lo que ve el modelo. La descripción no es para personas: es lo que el modelo lee para decidir
// cuándo usarla, qué pasarle y cómo leer lo que devuelve. Por eso cambia con la búsqueda: por el
// significado, la consulta puede ser una frase («algo para el frío»); por el nombre, tiene que ser
// una palabra del nombre. strict: true hace que la API solo deje al modelo llamarla con una entrada
// que cumple el esquema (un objeto con consulta, de texto, y nada más: additionalProperties: false).
// Los límites (que no esté vacía, que no sea larguísima) no caben en el modo strict, que no admite
// minLength ni maxLength: los pone Zod, abajo.
const QUE_DEVUELVE =
  'Cada producto lleva su id, su nombre, su descripción (o null), su precio en céntimos de euro (precioCentimos: 850 son 8,50 €) y las unidades que quedan (stock: 0 es que está agotado).';

export const DESCRIPCION_POR_SIGNIFICADO = `Busca productos en el catálogo de la tienda por lo que significa la consulta, no solo por sus palabras: entiende frases y necesidades («algo para el frío», «un regalo para quien le gusta el café») y también nombres (taza). Úsala siempre que el cliente busque algo, pregunte si hay algo, cuánto cuesta o cuántas unidades quedan, antes de contestar: no sabes qué hay en la tienda si no lo buscas. Escribe la consulta con las palabras del cliente, en su idioma. Devuelve primero los productos que tienen la consulta en su nombre, si los hay, y después los ${CERCANOS} más parecidos por el significado, del más al menos parecido. ${QUE_DEVUELVE} distancia dice cuánto se parece a la consulta: cerca de 0, mucho; a partir de 0,6 o 0,7, casi nada (null: no se ha podido medir, pero el nombre coincide). Siempre devuelve productos, aunque ninguno sirva: mira la descripción y la distancia antes de recomendar uno, y si ninguno encaja, dilo.`;

export const DESCRIPCION_POR_NOMBRE = `Busca productos en el catálogo de la tienda por su nombre. Úsala siempre que el cliente pregunte si hay algo, cuánto cuesta o cuántas unidades quedan, antes de contestar: no sabes qué hay en la tienda si no lo buscas. Busca por una palabra del nombre, en singular y sin artículos (taza, sudadera, gorra): no entiende frases ni descripciones. Devuelve una lista de como mucho ${MAX_PRODUCTOS} productos. ${QUE_DEVUELVE} distancia es siempre null. Una lista vacía es que no hay ninguno con ese nombre.`;

// Lo que dice de la consulta, en una y otra búsqueda. El servidor MCP usa las mismas.
export const CONSULTA_POR_SIGNIFICADO =
  'Lo que busca el cliente, con sus palabras (algo para el frío) o el nombre de un producto (taza).';
export const CONSULTA_POR_NOMBRE =
  'Una palabra del nombre del producto, en singular: taza, camiseta, sudadera.';

// La configuración se lee al arrancar: la definición es la de la búsqueda que hay.
const porSignificado = config.BUSQUEDA_SEMANTICA === 'si';

const definicion: Anthropic.Tool = {
  name: 'buscar_productos',
  description: porSignificado ? DESCRIPCION_POR_SIGNIFICADO : DESCRIPCION_POR_NOMBRE,
  input_schema: {
    type: 'object',
    properties: {
      consulta: {
        type: 'string',
        description: porSignificado ? CONSULTA_POR_SIGNIFICADO : CONSULTA_POR_NOMBRE,
      },
    },
    required: ['consulta'],
    additionalProperties: false,
  },
  strict: true,
};
// #endregion definicion

// #region herramienta
// Lo que manda el modelo se comprueba otra vez, como cualquier dato que llega de fuera (Fase 3): el
// modo strict es una promesa de la API, y la tienda no se fía de nadie para sus datos.
const entrada = z.strictObject({
  consulta: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .min(1, 'No puede estar vacía')
    .max(100, 'Como máximo, 100 caracteres'),
});

export const buscarProductos: Herramienta = {
  definicion,
  etiqueta: 'Buscando productos…',
  async ejecutar(datos) {
    const { consulta } = entrada.parse(datos);
    return buscarEnCatalogo(consulta);
  },
};
// #endregion herramienta
