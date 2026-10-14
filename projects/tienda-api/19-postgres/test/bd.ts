// La base de datos de los tests (DATABASE_URL, en test/.env). Cada fichero de tests la prepara al
// empezar, así que da igual en qué orden se ejecuten.
import { execFile } from 'node:child_process';
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

/** Vacía la base de datos y la llena con npm run bd:crear. Devuelve lo que dice el script. */
export async function prepararBd(): Promise<string> {
  await vaciarBd();
  const { stdout } = await ejecutar('node', ['scripts/crear-bd.ts']);
  return stdout;
}

/** La base de datos, preparada antes del primer test del fichero y cerrada después del último. */
export function usarBd() {
  before(prepararBd);
  after(() => pool.end());
}
