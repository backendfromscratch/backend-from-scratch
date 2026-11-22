// Los embeddings (Fase 11, lección 5). Un embedding es un texto convertido en un vector: una lista
// de números (aquí, 384) que dice de qué trata. Lo calcula un modelo entrenado para que dos textos
// que significan lo mismo den vectores que apuntan hacia el mismo sitio, aunque no compartan ni una
// palabra: «algo para el frío» y «Bufanda de lana gruesa» quedan cerca; «Gorra para el sol», lejos.
// Lo cerca que están dos vectores es la distancia del coseno (el operador <=> de pgvector): 0 si
// apuntan exactamente al mismo sitio, 1 si no tienen nada que ver, 2 si son opuestos.
//
// La API de Claude no calcula embeddings, así que la tienda usa un modelo pequeño que corre en tu
// propio ordenador, con Transformers.js (@huggingface/transformers): gratis, sin otra cuenta ni
// otra clave, y sin internet después de descargarlo la primera vez. Entiende español e inglés.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import { config } from './config.ts';
import { productos } from './esquema.ts';
import { log } from './log.ts';

// #region embebedor
// Cuántos números tiene cada vector: los que da el modelo. La columna productos.embedding es
// vector(384) (migración 014): con otro modelo, que diera otro número, habría que cambiar las dos.
export const DIMENSIONES = 384;

// El modelo, en Hugging Face (huggingface.co, donde se publican los modelos abiertos): una versión
// de paraphrase-multilingual-MiniLM-L12-v2 preparada para Transformers.js. Lo elegimos midiendo
// (2026-11-20): de los pequeños que entienden español, el que mejor ordenaba el catálogo.
export const MODELO_EMBEDDINGS = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// Y su versión exacta: un commit de su repositorio en Hugging Face (el del 2025-07-22, el último
// cuando lo elegimos). Sin ella se descarga la más nueva (main), y si alguien cambiara sus
// ficheros, los vectores nuevos dejarían de parecerse a los ya guardados, sin que nada avisara.
// Como con las versiones exactas de package.json, cambiarla es una decisión, y después hay que
// calcular otra vez todos los vectores: npm run embeddings -- --todos.
export const REVISION_EMBEDDINGS = '2c4055b12046f11709e9df2c122e59ffbdc2f900';

// Lo que la tienda necesita de un modelo de embeddings: textos dentro, un vector por texto fuera,
// en el mismo orden. Con esto, el resto de la tienda no sabe qué modelo hay detrás, y los tests
// ponen uno de mentira (test/embebedor-falso.ts) que no descarga nada y contesta al momento.
export interface Embebedor {
  vectores(textos: string[]): Promise<number[][]>;
}
// #endregion embebedor

// #region carpeta-del-modelo
// Los ficheros que el modelo necesita en q8. Al descargarlos con una versión exacta,
// Transformers.js los guarda en carpeta/modelo/revisión: con ./modelos, en
// ./modelos/Xenova/paraphrase-multilingual-MiniLM-L12-v2/2c4055b…/.
export const FICHEROS_DEL_MODELO = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

// De dónde se carga el modelo: de esa carpeta, si ya están todos sus ficheros, o de Hugging Face,
// por su nombre, si falta alguno (la primera vez, o si una descarga se cortó a medias). ¿Por qué
// no siempre por el nombre? Porque así, aunque los ficheros ya estén en la carpeta, Transformers.js
// (la 4.3.2) pregunta a huggingface.co si el modelo tiene tokenizador, y lo pregunta por la
// versión main, no por la nuestra, que es la que está guardada: dos peticiones cada vez que carga
// el modelo, y, en un servidor sin internet, un error. Con la ruta de una carpeta no pregunta a
// nadie: lee los ficheros y ya está. Así, después de la primera descarga, la tienda no necesita
// internet para cargar el modelo.
export function origenDelModelo(carpeta: string): string {
  const descargado = resolve(carpeta, MODELO_EMBEDDINGS, REVISION_EMBEDDINGS);
  const estanTodos = FICHEROS_DEL_MODELO.every((fichero) => existsSync(join(descargado, fichero)));
  return estanTodos ? descargado : MODELO_EMBEDDINGS;
}
// #endregion carpeta-del-modelo

// #region local
// El de verdad, con Transformers.js. No carga nada al crearse: el modelo (unos 135 MB en disco y
// unos 400 MB de memoria) se carga la primera vez que alguien pide un vector, y la promesa se
// guarda, así que las siguientes peticiones lo reutilizan, también las que llegan mientras carga.
// Un proceso que nunca busca por el significado no paga nada. carpeta: dónde se guardan los
// ficheros del modelo; si no están, se descargan de Hugging Face (unos 30 segundos la primera vez;
// después, menos de un segundo, y sin internet).
export function crearEmbebedorLocal(carpeta: string): Embebedor {
  let cargando: Promise<FeatureExtractionPipeline> | undefined;

  async function cargar(): Promise<FeatureExtractionPipeline> {
    const inicio = performance.now();
    log.info(
      { modelo: MODELO_EMBEDDINGS, revision: REVISION_EMBEDDINGS, carpeta },
      'cargando el modelo de embeddings',
    );
    // #region cargar-modelo
    // import() aquí, y no arriba: la librería también pesa (onnxruntime, el motor que ejecuta el
    // modelo), y así solo se carga si hace falta.
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = carpeta;
    // feature-extraction: del texto, sus «características», un vector por cada trozo de palabra.
    // origenDelModelo: la carpeta con los ficheros, sin internet, o, si falta alguno, el nombre en
    // Hugging Face: entonces los descarga en env.cacheDir, y la próxima vez ya están ahí.
    // q8: los pesos del modelo guardados con 8 bits en lugar de 32, cuatro veces más pequeño y casi
    // igual de bueno.
    // revision: la versión exacta de arriba, la que se descarga (desde la carpeta no hace falta:
    // sus ficheros ya son los de esa versión).
    const extractor = await pipeline('feature-extraction', origenDelModelo(carpeta), {
      dtype: 'q8',
      revision: REVISION_EMBEDDINGS,
    });
    // #endregion cargar-modelo
    log.info({ ms: Math.round(performance.now() - inicio) }, 'modelo de embeddings cargado');
    return extractor;
  }

  return {
    async vectores(textos) {
      // Si la carga falla (sin internet la primera vez, por ejemplo), se olvida: la siguiente
      // petición lo intenta otra vez, en lugar de recibir el mismo error para siempre.
      cargando ??= cargar().catch((error: unknown) => {
        cargando = undefined;
        throw error;
      });
      const extractor = await cargando;
      // pooling: 'mean': la media de los vectores de cada trozo, un solo vector por texto.
      // normalize: true: todos de longitud 1, así que solo cuenta hacia dónde apuntan.
      const salida = await extractor(textos, { pooling: 'mean', normalize: true });
      return salida.tolist() as number[][];
    },
  };
}
// #endregion local

// #region el-de-la-tienda
// El embebedor que usa la tienda: el de verdad, con la carpeta de la configuración, creado la
// primera vez que hace falta. usarEmbebedor lo cambia por otro: lo hacen los tests.
let embebedor: Embebedor | undefined;

export function usarEmbebedor(otro: Embebedor): void {
  embebedor = otro;
}

export function vectores(textos: string[]): Promise<number[][]> {
  embebedor ??= crearEmbebedorLocal(config.MODELOS_DIR);
  return embebedor.vectores(textos);
}
// #endregion el-de-la-tienda

// #region texto-del-producto
// Lo que se convierte en el vector de un producto: su nombre y, si la tiene, su descripción. Lo
// demás (el precio, el stock) no dice de qué trata.
export function textoDelProducto(producto: { nombre: string; descripcion: string | null }): string {
  return producto.descripcion ? `${producto.nombre}. ${producto.descripcion}` : producto.nombre;
}
// #endregion texto-del-producto

// #region guardar-vectores
// Calcula y guarda el vector de los productos que se le digan, todos en una sola llamada al
// modelo. Lo usan el trabajador (el producto que acaba de cambiar: cola.ts) y npm run embeddings
// (los que faltan, de 32 en 32). Devuelve cuántos ha guardado.
// Mientras el modelo calcula, alguien puede cambiar otra vez el producto. Por eso el UPDATE solo
// escribe si el nombre y la descripción siguen siendo los que se leyeron: si no, el vector ya no es
// el suyo, y el trabajo del cambio nuevo calculará el bueno. (IS NOT DISTINCT FROM es el = que
// también vale para NULL: NULL = NULL no es verdad en SQL, pero NULL IS NOT DISTINCT FROM NULL, sí.)
export async function guardarVectores(ids: number[]): Promise<number> {
  const filas = await bd
    .select({ id: productos.id, nombre: productos.nombre, descripcion: productos.descripcion })
    .from(productos)
    .where(inArray(productos.id, ids));
  if (filas.length === 0) return 0;
  const lista = await vectores(filas.map(textoDelProducto));
  let guardados = 0;
  for (const [i, fila] of filas.entries()) {
    const cambiados = await bd
      .update(productos)
      .set({ embedding: lista[i] })
      .where(
        and(
          eq(productos.id, fila.id),
          eq(productos.nombre, fila.nombre),
          sql`${productos.descripcion} IS NOT DISTINCT FROM ${fila.descripcion}`,
        ),
      )
      .returning({ id: productos.id });
    guardados += cambiados.length;
  }
  return guardados;
}
// #endregion guardar-vectores

// #region rellenar
// Lo que hace npm run embeddings: los vectores de los productos que no tienen (los que ya había
// antes de la migración 014, o los que cambiaron con la búsqueda semántica apagada), de 32 en 32.
// todos: true calcula también los que ya tienen: después de cambiar de modelo, por ejemplo.
export const LOTE = 32;

export async function rellenarVectores(todos = false): Promise<number> {
  const filas = await bd
    .select({ id: productos.id })
    .from(productos)
    .where(todos ? undefined : sql`${productos.embedding} IS NULL`)
    .orderBy(productos.id);
  let guardados = 0;
  for (let desde = 0; desde < filas.length; desde += LOTE) {
    const lote = filas.slice(desde, desde + LOTE).map((fila) => fila.id);
    guardados += await guardarVectores(lote);
  }
  return guardados;
}
// #endregion rellenar
