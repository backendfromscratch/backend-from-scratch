// La base de datos de los tests (DATABASE_URL, en test/.env). Cada fichero de tests la prepara al
// empezar, así que da igual en qué orden se ejecuten.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before } from 'node:test';
import { promisify } from 'node:util';
import { pool } from '../src/bd.ts';

export const ejecutar = promisify(execFile);

/**
 * La deja vacía: borra todas las tablas del esquema public. Hasta la Fase 10 borraba el esquema
 * entero y lo creaba de nuevo; desde la Fase 11 no, porque dentro está la extensión vector
 * (migración 014), y volver a activarla es cosa de un superusuario: el usuario tienda de tu
 * PostgreSQL no podría. Así, la extensión se activa una vez (el README dice cómo) y se queda.
 */
export async function vaciarBd() {
  try {
    // format('%I'): cada nombre entre comillas si hace falta, como lo escribiría PostgreSQL.
    const { rows } = await pool.query<{ tabla: string }>(
      `SELECT format('%I', tablename) AS tabla FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length > 0) {
      await pool.query(`DROP TABLE ${rows.map((fila) => fila.tabla).join(', ')} CASCADE`);
    }
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    throw new Error(
      `No se puede usar la base de datos de los tests (DATABASE_URL, en test/.env). ` +
        `¿Está PostgreSQL arrancado? (${code ?? ''} ${message})`,
    );
  }
}

/**
 * Vacía la base de datos, aplica las migraciones y carga los datos de ejemplo: lo que hacen
 * npm run bd:migrar y npm run bd:datos, pero sin arrancar otro proceso para cada uno, que es más
 * lento. Los scripts de verdad se prueban en modelo.test.ts y migraciones.test.ts.
 */
export async function prepararBd() {
  await vaciarBd();
  for (const nombre of (await readdir('bd/migraciones')).sort()) {
    try {
      await pool.query(await readFile(join('bd/migraciones', nombre), 'utf8'));
    } catch (error) {
      // 42501: sin permiso. Aquí, el de activar la extensión vector (migración 014).
      if ((error as { code?: string }).code === '42501' && /extension/.test(String(error))) {
        throw new Error(
          'La base de datos de los tests no tiene la extensión vector, y el usuario tienda no ' +
            'puede activarla: actívala tú, como superusuario (README, Fase 11): ' +
            'psql -d tienda_test -c "CREATE EXTENSION vector"',
        );
      }
      throw error;
    }
  }
  await pool.query(await readFile('bd/cuentas.sql', 'utf8'));
  await pool.query(await readFile('bd/datos.sql', 'utf8'));
}

/**
 * La base de datos, preparada antes del primer test del fichero y cerrada después del último. Si
 * se le da una función, la ejecuta en cuanto la base de datos está lista: para crear las sesiones
 * de los tests, por ejemplo (identidades.ts).
 */
export function usarBd(despues?: () => Promise<void>) {
  before(async () => {
    await prepararBd();
    await despues?.();
  });
  after(() => pool.end());
}
