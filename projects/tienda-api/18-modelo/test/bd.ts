// La base de datos de los tests (DATABASE_URL, en test/.env). Cada fichero de tests la prepara al
// empezar, así que da igual en qué orden se ejecuten.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';

export const ejecutar = promisify(execFile);

export const bd = new Pool({ connectionString: process.env.DATABASE_URL });

/** La deja vacía: borra el esquema public, con todas sus tablas, y lo crea de nuevo. */
export async function vaciarBd() {
  try {
    await bd.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
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
