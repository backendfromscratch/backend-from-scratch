// Carga los datos de ejemplo (bd/datos.sql) en una base de datos recién migrada, todavía vacía. En
// una que ya tiene datos, los repetiría: entonces se niega. Ejecútalo con: npm run bd:datos
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/bd.ts';

try {
  // count(*) es un bigint, y pg lo devuelve como texto: ::int lo convierte en un número normal.
  const { rows } = await pool.query('SELECT count(*)::int AS productos FROM productos');
  if (rows[0].productos > 0) {
    console.error('La base de datos ya tiene productos: npm run bd:datos solo es para una vacía');
    process.exitCode = 1;
  } else {
    await pool.query(await readFile(join(import.meta.dirname, '..', 'bd', 'datos.sql'), 'utf8'));
    console.log('Datos de ejemplo cargados');
  }
} finally {
  await pool.end();
}
