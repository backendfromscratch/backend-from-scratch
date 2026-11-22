// Prueba el modelo de embeddings de verdad (Fase 11, lección 5), sin base de datos. Ejecútalo con:
//   npm run probar-embeddings
// npm test no lo carga nunca (los tests usan uno de mentira, test/embebedor-falso.ts): este script
// comprueba que el de verdad ordena bien el catálogo de práctica. Calcula los vectores de los
// productos de bd/datos.sql y de unas cuantas preguntas, y enseña los más cercanos a cada una.
// Falla (sale con 1) si para «algo para el frío» los tres primeros no son ropa de abrigo, por
// delante de todo lo de verano, o si después de cargarlo sus ficheros no están donde la tienda los
// busca para cargarlo sin internet. Usa la configuración de los tests (test/.env):
// solo le hace falta MODELOS_DIR, que allí no está (./modelos, la carpeta del proyecto). La primera
// vez descarga el modelo, unos 135 MB.
import { readFile } from 'node:fs/promises';
import {
  crearEmbebedorLocal,
  MODELO_EMBEDDINGS,
  origenDelModelo,
  textoDelProducto,
} from '../src/embeddings.ts';
import { config } from '../src/config.ts';

// #region catalogo
// Los productos de práctica, leídos de bd/datos.sql: una línea por producto, como
//   ('Bufanda', 'Bufanda larga de lana gruesa…', 2200, 30),
const sql = await readFile(new URL('../bd/datos.sql', import.meta.url), 'utf8');
const catalogo = [...sql.matchAll(/^ {2}\('([^']+)', '([^']+)', \d+, \d+\)[,;]$/gm)].map(
  ([, nombre, descripcion]) => ({ nombre: nombre!, descripcion: descripcion! }),
);

// La ropa de abrigo, la que «algo para el frío» tiene que encontrar primero.
const DE_ABRIGO = ['Bufanda', 'Guantes', 'Gorro de lana', 'Sudadera', 'Manta'];
for (const nombre of DE_ABRIGO) {
  if (!catalogo.some((producto) => producto.nombre === nombre)) {
    console.error(`${nombre} no está en bd/datos.sql: cambia la lista de este script`);
    process.exit(1);
  }
}
// #endregion catalogo

// #region medir
// #region distancia
// Distancia del coseno entre dos vectores de longitud 1: 1 menos su producto escalar (la suma de
// multiplicarlos número a número). Lo mismo que calcula el <=> de pgvector.
const distancia = (a: number[], b: number[]) => 1 - a.reduce((suma, x, i) => suma + x * b[i]!, 0);
// #endregion distancia

const embebedor = crearEmbebedorLocal(config.MODELOS_DIR);
const memoriaAntes = process.memoryUsage().rss;

let inicio = performance.now();
const vectores = await embebedor.vectores(catalogo.map(textoDelProducto));
const cargaYCatalogo = performance.now() - inicio;

// Otra vez, ya cargado: lo que cuesta calcular los vectores, sin la carga.
inicio = performance.now();
await embebedor.vectores(catalogo.map(textoDelProducto));
const soloCatalogo = performance.now() - inicio;
const memoriaDespues = process.memoryUsage().rss;

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
console.log(`Modelo: ${config.MODELOS_DIR}`);
console.log(
  `Carga del modelo y ${catalogo.length} vectores: ${(cargaYCatalogo / 1000).toFixed(1)} s; ` +
    `los ${catalogo.length} otra vez, ya cargado: ${Math.round(soloCatalogo)} ms ` +
    `(${Math.round(soloCatalogo / catalogo.length)} ms cada uno)`,
);
console.log(
  `Memoria del proceso (RSS): ${mb(memoriaAntes)} MB antes, ${mb(memoriaDespues)} MB con el modelo`,
);
// #endregion medir

// Ya cargado, sus ficheros tienen que estar donde la tienda los busca (origenDelModelo, en
// src/embeddings.ts): si no, cada carga preguntaría otra vez a Hugging Face, y sin internet no
// cargaría. Pasaría, por ejemplo, con otra versión de Transformers.js que los guardara en otro sitio.
if (origenDelModelo(config.MODELOS_DIR) === MODELO_EMBEDDINGS) {
  console.error(
    `Mal: los ficheros del modelo no están en ${config.MODELOS_DIR}, donde la tienda los busca`,
  );
  process.exit(1);
}

// #region preguntas
async function cercanos(pregunta: string) {
  const [vector] = await embebedor.vectores([pregunta]);
  return catalogo
    .map((producto, i) => ({
      nombre: producto.nombre,
      distancia: distancia(vector!, vectores[i]!),
    }))
    .toSorted((a, b) => a.distancia - b.distancia);
}

const preguntas = [
  'algo para el frío',
  'un regalo para alguien a quien le encanta el café',
  'algo para el verano',
  'taza',
];
let frio: { nombre: string; distancia: number }[] = [];
for (const pregunta of preguntas) {
  const orden = await cercanos(pregunta);
  if (pregunta === preguntas[0]) frio = orden;
  console.log(`\n«${pregunta}»`);
  for (const { nombre, distancia } of orden.slice(0, 5)) {
    console.log(`  ${distancia.toFixed(3)}  ${nombre}`);
  }
}
// #endregion preguntas

// #region comprobar
// Lo que tiene que cumplir: para «algo para el frío», los tres primeros, ropa de abrigo (y por tanto
// por delante de todo lo de verano). No pedimos que toda la de abrigo vaya antes que toda la de
// verano: el modelo entiende de qué trata una frase (aquí, de ropa y de la temperatura), pero no
// siempre hacia qué lado. El 2026-11-21, con este catálogo, el Abanico («para darte aire en los días
// de calor») salía quinto, por delante de la Sudadera: la lección 5 lo enseña.
const tresPrimeros = frio.slice(0, 3).map((producto) => producto.nombre);
const noDeAbrigo = tresPrimeros.filter((nombre) => !DE_ABRIGO.includes(nombre));
if (noDeAbrigo.length > 0) {
  console.error(
    `\nMal: para «algo para el frío», entre los tres primeros (${tresPrimeros.join(', ')}) ` +
      `hay algo que no es ropa de abrigo: ${noDeAbrigo.join(', ')}`,
  );
  process.exit(1);
}
console.log(`\nBien: para «algo para el frío», los tres primeros son ropa de abrigo`);
// #endregion comprobar
