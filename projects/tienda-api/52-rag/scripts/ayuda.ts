// Carga las páginas de ayuda en la base de datos (Fase 11, lección 6). Ejecútalo con:
//   npm run ayuda
// Lee los ficheros de ayuda/, los parte en trozos (uno por sección), calcula el vector de cada uno y
// cambia los de la tabla fragmentos_ayuda por estos, en una transacción (src/ayuda.ts). Ejecútalo
// otra vez después de cambiar una página, o después de encender la búsqueda semántica: con
// BUSQUEDA_SEMANTICA=no guarda los trozos sin vector, y buscar_en_ayuda busca por palabras.
// Con Docker Compose, dentro del trabajador, que tiene el volumen de los modelos:
//   docker compose exec trabajador node scripts/ayuda.ts
// (el trabajador ya la carga solo al arrancar, si la tabla está vacía). La primera vez con la
// búsqueda semántica encendida descarga el modelo (unos 135 MB).
import { cargarAyuda } from '../src/ayuda.ts';
import { pool } from '../src/bd.ts';

try {
  const inicio = performance.now();
  const { fragmentos, conVectores } = await cargarAyuda();
  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
  console.log(
    `Ayuda cargada: ${fragmentos} fragmentos, ${conVectores ? 'con' : 'sin'} vectores, en ${segundos} s`,
  );
  if (!conVectores) {
    console.log('Con BUSQUEDA_SEMANTICA=no, buscar_en_ayuda busca por palabras.');
  }
} catch (error) {
  console.error(`No se ha podido cargar la ayuda: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
