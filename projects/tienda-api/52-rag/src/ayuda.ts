// Las páginas de ayuda de la tienda (Fase 11, lección 6): envíos, devoluciones, pagos y la cuenta,
// cada una en un fichero Markdown de la carpeta ayuda/, escritas para personas. Un modelo no sabe
// nada de esta tienda (ni sus plazos ni sus normas), así que el asistente las consulta con su
// herramienta buscar_en_ayuda antes de contestar: es RAG (src/asistente/herramientas/
// buscar-en-ayuda.ts). Para eso, las páginas se parten en trozos (fragmentos), uno por sección, y
// cada trozo se guarda en la tabla fragmentos_ayuda (migración 015) con su vector, como un producto.
// Lo hace npm run ayuda (scripts/ayuda.ts), y el trabajador la primera vez que arranca la tienda.
//
// ¿Por qué en trozos, y no las páginas enteras? Porque se busca el trozo que trata de la pregunta: un
// vector resume un texto entero, y el de una página que habla de cuatro cosas no se parece mucho a
// ninguna de ellas. Y porque lo que se devuelve entra en la conversación, y cada token se paga: mejor
// la sección que contesta que la página entera.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import { config } from './config.ts';
import { LOTE, vectores } from './embeddings.ts';
import { fragmentosAyuda } from './esquema.ts';

// #region trocear
// Un trozo de una página: su página (pagina, el nombre del fichero sin .md; titulo, el título de la
// página), su sección y su texto.
export interface Fragmento {
  pagina: string;
  titulo: string;
  seccion: string;
  texto: string;
}

// Parte una página en trozos por sus títulos de sección (las líneas que empiezan por «## »). El
// título de la página es su línea «# »; si no la tiene, el nombre del fichero. Lo que haya entre el
// título de la página y la primera sección, si hay algo, es otro trozo, con el título de la página
// como sección. Cada trozo lleva los dos títulos, porque el texto de una sección suele contar con
// ellos: «Tienes 30 días desde que recibes el pedido…» no dice para qué, y «Cancelaciones y
// devoluciones: Devolver un producto» sí.
export function trocearPagina(pagina: string, markdown: string): Fragmento[] {
  // split con una expresión regular corta el texto en cada «## » del principio de una línea (la m
  // hace que ^ sea el principio de cada línea, no solo el del texto). El primer trozo es lo de
  // antes de la primera sección. \r\n es el salto de línea de Windows: se deja en \n.
  const [cabecera = '', ...secciones] = markdown.replaceAll('\r\n', '\n').split(/^## +/m);
  const titulo = /^# +(.+)$/m.exec(cabecera)?.[1]?.trim() ?? pagina;
  const trozos = [
    { seccion: titulo, texto: cabecera.replace(/^# +.+$/m, '') },
    ...secciones.map((seccion) => {
      const [primera = '', ...resto] = seccion.split('\n');
      return { seccion: primera.trim(), texto: resto.join('\n') };
    }),
  ];
  return trozos
    .map(({ seccion, texto }) => ({ pagina, titulo, seccion, texto: limpiar(texto) }))
    .filter((fragmento) => fragmento.texto !== '');
}

// El texto, sin las marcas de negrita de Markdown (**pagado** queda en pagado): el asistente
// contesta en texto normal, y no hace falta enseñarle asteriscos. Sin las líneas en blanco de más.
const limpiar = (texto: string) =>
  texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Un trozo, mejor corto. El modelo de embeddings (paraphrase-multilingual-MiniLM-L12-v2) se entrenó
// con textos de hasta 128 tokens (max_seq_length, en su sentence_bert_config.json). La versión ONNX
// que usa la tienda acepta hasta 512 (max_position_embeddings), pero más allá de 128 trabaja fuera
// de lo que aprendió. El trozo más largo de la ayuda tiene 118 (medido el 2026-11-21).
// #region texto-del-fragmento
// Lo que se convierte en el vector de un trozo: sus dos títulos y su texto, como el nombre y la
// descripción de un producto (textoDelProducto, en embeddings.ts).
export const textoDelFragmento = ({ titulo, seccion, texto }: Fragmento) =>
  `${titulo}: ${seccion}. ${texto}`;
// #endregion texto-del-fragmento
// #endregion trocear

// #region leer
// La carpeta de las páginas: ayuda/, en la raíz del proyecto (en la imagen, /app/ayuda).
export const CARPETA_AYUDA = join(import.meta.dirname, '..', 'ayuda');

// Todas las páginas de la carpeta (los .md), por orden alfabético, en trozos.
export async function leerAyuda(carpeta = CARPETA_AYUDA): Promise<Fragmento[]> {
  const ficheros = (await readdir(carpeta)).filter((fichero) => fichero.endsWith('.md')).sort();
  const fragmentos: Fragmento[] = [];
  for (const fichero of ficheros) {
    const markdown = await readFile(join(carpeta, fichero), 'utf8');
    fragmentos.push(...trocearPagina(fichero.slice(0, -'.md'.length), markdown));
  }
  return fragmentos;
}
// #endregion leer

// #region cargar
// Lo que hace npm run ayuda: lee las páginas, calcula el vector de cada trozo (de LOTE en LOTE, como
// los de los productos) y cambia lo que haya en la tabla por los trozos nuevos. Se puede ejecutar
// las veces que haga falta (después de cambiar una página, por ejemplo): siempre deja la tabla igual
// que las páginas. Con BUSQUEDA_SEMANTICA=no guarda los trozos sin vector: buscar_en_ayuda busca
// entonces por palabras, y no hace falta el modelo. Devuelve cuántos trozos ha guardado y si llevan
// vector.
export interface Carga {
  fragmentos: number;
  conVectores: boolean;
}

export async function cargarAyuda(carpeta = CARPETA_AYUDA): Promise<Carga> {
  const fragmentos = await leerAyuda(carpeta);
  // Una carpeta vacía (o la que no es) no borra la ayuda que hay.
  if (fragmentos.length === 0) throw new Error(`No hay ninguna página de ayuda en ${carpeta}`);

  // Los vectores, antes de la transacción: el modelo puede tardar (la primera vez, unos 30
  // segundos, con la descarga), y una transacción abierta todo ese tiempo bloquearía la tabla.
  const conVectores = config.BUSQUEDA_SEMANTICA === 'si';
  const lista: number[][] = [];
  if (conVectores) {
    for (let desde = 0; desde < fragmentos.length; desde += LOTE) {
      const lote = fragmentos.slice(desde, desde + LOTE);
      lista.push(...(await vectores(lote.map(textoDelFragmento))));
    }
  }

  // Borrar los viejos y guardar los nuevos, en una transacción: quien busque mientras tanto ve los
  // de antes, hasta el COMMIT, y después los nuevos; nunca la tabla vacía ni a medias. LOCK TABLE …
  // IN EXCLUSIVE MODE deja leer la tabla, pero no escribirla, hasta el final de la transacción: si
  // dos cargas coinciden (el trabajador al arrancar y npm run ayuda, por ejemplo), la segunda espera
  // a que acabe la primera, borra lo suyo y guarda lo de ella. Sin el bloqueo, la segunda no vería
  // las filas que la primera aún no había confirmado, no las borraría, y la tabla acabaría con los
  // trozos dos veces.
  await bd.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${fragmentosAyuda} IN EXCLUSIVE MODE`);
    await tx.delete(fragmentosAyuda);
    await tx
      .insert(fragmentosAyuda)
      .values(fragmentos.map((fragmento, i) => ({ ...fragmento, embedding: lista[i] ?? null })));
  });
  return { fragmentos: fragmentos.length, conVectores };
}

// Lo que hace el trabajador al arrancar (scripts/trabajador.ts): cargar la ayuda solo si la tabla
// está vacía, la primera vez que arranca la tienda (o después de docker compose down -v). Así, con
// Docker Compose, el asistente tiene la ayuda sin que nadie haga nada. Si ya hay trozos, no los toca:
// después de cambiar una página, npm run ayuda. Devuelve la carga, o undefined si no ha hecho falta.
export async function cargarAyudaSiFalta(): Promise<Carga | undefined> {
  const [alguno] = await bd.select({ id: fragmentosAyuda.id }).from(fragmentosAyuda).limit(1);
  return alguno ? undefined : cargarAyuda();
}
// #endregion cargar
