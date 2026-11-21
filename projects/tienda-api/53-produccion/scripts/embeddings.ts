// Calcula los vectores de los productos que no tienen (Fase 11, lección 5). Ejecútalo con:
//   npm run embeddings              los que faltan: los de antes de la migración 014, o los que
//                                   cambiaron con BUSQUEDA_SEMANTICA=no
//   npm run embeddings -- --todos   todos otra vez: después de cambiar de modelo, por ejemplo
// Con Docker Compose, dentro del trabajador, que tiene el volumen de los modelos:
//   docker compose exec trabajador node scripts/embeddings.ts
// Hace lo mismo que el trabajador con cada producto que cambia (guardarVectores, en
// src/embeddings.ts), de 32 en 32. La primera vez descarga el modelo (unos 135 MB).
import { parseArgs } from 'node:util';
import { pool } from '../src/bd.ts';
import { config } from '../src/config.ts';
import { rellenarVectores } from '../src/embeddings.ts';

let todos: boolean;
try {
  todos =
    parseArgs({ options: { todos: { type: 'boolean' } }, strict: true }).values.todos === true;
} catch (error) {
  console.error(`Argumento no válido: ${(error as Error).message}`);
  console.error('Uso: npm run embeddings, o npm run embeddings -- --todos');
  process.exit(1);
}

// Con la búsqueda semántica apagada, la tienda no usa los vectores: calcularlos solo ocuparía
// memoria (el modelo) y tiempo.
if (config.BUSQUEDA_SEMANTICA === 'no') {
  console.error('BUSQUEDA_SEMANTICA=no: la tienda no usa los vectores. Enciéndela antes (si).');
  process.exit(1);
}

try {
  const inicio = performance.now();
  const guardados = await rellenarVectores(todos);
  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
  console.log(`Vectores calculados: ${guardados}, en ${segundos} s`);
} finally {
  await pool.end();
}
