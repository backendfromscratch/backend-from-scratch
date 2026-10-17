// Aplica las migraciones que falten, en orden. Ejecútalo con: npm run bd:migrar
// Cada migración es un fichero .sql de bd/migraciones/ con un número delante (001, 002…). Se
// aplica una sola vez: la tabla migraciones apunta las que ya están.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/bd.ts';

// La carpeta se puede cambiar (los tests lo hacen): npm run bd:migrar -- otra/carpeta
const carpeta = process.argv[2] ?? join(import.meta.dirname, '..', 'bd', 'migraciones');

// #region registro
await pool.query(`
  CREATE TABLE IF NOT EXISTS migraciones (
    nombre text PRIMARY KEY,
    aplicada_en timestamptz NOT NULL DEFAULT now()
  )
`);
const { rows } = await pool.query<{ nombre: string }>('SELECT nombre FROM migraciones');
const aplicadas = new Set(rows.map((fila) => fila.nombre));
// sort() las ordena por nombre: el número del principio decide el orden.
const ficheros = (await readdir(carpeta)).filter((fichero) => fichero.endsWith('.sql')).sort();
const pendientes = ficheros.filter((fichero) => !aplicadas.has(fichero));
// #endregion registro

// #region aplicar
// Una transacción va entera por la misma conexión: se pide una al pool y se devuelve al final.
const cliente = await pool.connect();
try {
  for (const nombre of pendientes) {
    await cliente.query('BEGIN');
    try {
      await cliente.query(await readFile(join(carpeta, nombre), 'utf8'));
      await cliente.query('INSERT INTO migraciones (nombre) VALUES ($1)', [nombre]);
      await cliente.query('COMMIT'); // la migración y su apunte, a la vez
      console.log(`Aplicada: ${nombre}`);
    } catch (error) {
      // ROLLBACK deshace todo lo que hizo esta migración: no queda nada a medias.
      await cliente.query('ROLLBACK');
      console.error(`No se ha aplicado ${nombre}: ${(error as Error).message}`);
      process.exitCode = 1;
      break; // las siguientes pueden depender de esta: se paran aquí
    }
  }
  if (pendientes.length === 0) {
    console.log('No hay migraciones nuevas: la base de datos está al día');
  }
} finally {
  cliente.release();
  await pool.end();
}
// #endregion aplicar
