// La base de datos de los tests (DATABASE_URL, en test/.env). Cada fichero de tests la prepara al
// empezar, así que da igual en qué orden se ejecuten.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before } from 'node:test';
import { promisify } from 'node:util';
import { pool } from '../src/bd.ts';

export const ejecutar = promisify(execFile);

/** La deja vacía: borra el esquema public, con todas sus tablas, y lo crea de nuevo. */
export async function vaciarBd() {
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
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
    await pool.query(await readFile(join('bd/migraciones', nombre), 'utf8'));
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
