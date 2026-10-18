// Carga los datos de práctica. Ejecútalo con: npm run bd:datos
// - bd/cuentas.sql: las cuentas de práctica (Fase 6). Siempre: las que ya estén no se repiten. Así
//   también las recibe quien sigue con la base de datos de la Fase 5, que ya tiene datos.
//   Con --sin-cuentas (npm run bd:datos:produccion) no se cargan: sus contraseñas son públicas, y en
//   producción la primera cuenta se crea con npm run crear-admin.
// - bd/datos.sql: los productos, las categorías y los pedidos de ejemplo, solo si todavía no hay
//   ningún producto: en una base de datos que ya los tiene, los repetiría.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pool } from '../src/bd.ts';

const leer = (fichero: string) => readFile(join(import.meta.dirname, '..', 'bd', fichero), 'utf8');

// Estricto: un argumento que no es --sin-cuentas (una errata, por ejemplo) para el script antes de
// cargar nada. Si no, una errata cargaría las cuentas de práctica, con contraseñas públicas, en
// producción.
let sinCuentas: boolean;
try {
  sinCuentas =
    parseArgs({ options: { 'sin-cuentas': { type: 'boolean' } }, strict: true }).values[
      'sin-cuentas'
    ] === true;
} catch (error) {
  console.error(`Argumento no válido: ${(error as Error).message}`);
  console.error('Uso: npm run bd:datos, o npm run bd:datos:produccion (con --sin-cuentas)');
  process.exit(1);
}

try {
  if (sinCuentas) {
    console.log('Sin cuentas de práctica: no se cargan (--sin-cuentas)');
  } else {
    await pool.query(await leer('cuentas.sql'));
    console.log('Cuentas de práctica listas (sus contraseñas están en el README)');
  }
  // count(*) es un bigint, y pg lo devuelve como texto: ::int lo convierte en un número normal.
  const { rows } = await pool.query('SELECT count(*)::int AS productos FROM productos');
  if (rows[0].productos > 0) {
    console.log('La base de datos ya tiene productos: los de ejemplo no se cargan otra vez');
  } else {
    await pool.query(await leer('datos.sql'));
    console.log('Datos de ejemplo cargados');
  }
} finally {
  await pool.end();
}
