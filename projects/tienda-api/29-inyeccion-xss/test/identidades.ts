// Quién hace cada petición en los tests: las cuentas de práctica de bd/datos.sql y una clave de
// reparto. Las sesiones se crean directamente, sin pasar por la contraseña: así no se calcula un
// argon2 en cada test. Iniciar sesión de verdad se prueba en sesiones.test.ts.
import { crearClave } from '../src/claves.ts';
import { crearSesion } from '../src/sesiones.ts';

export const ANA = 1; // admin
export const LUIS = 2; // admin
export const CARMEN = 3; // cliente: los pedidos de número impar
export const PABLO = 4; // cliente: los de número par

/** Las cabeceras de una sesión nueva de esa cuenta: la cookie, como la mandaría el navegador. */
export async function comoUsuario(id: number): Promise<Record<string, string>> {
  return { Cookie: `sesion=${await crearSesion(id)}` };
}

/** Las cabeceras de una clave de API nueva, de la empresa de reparto. */
export async function comoReparto(): Promise<Record<string, string>> {
  const { clave } = await crearClave('Reparto Rápido');
  return { Authorization: `Bearer ${clave}` };
}
