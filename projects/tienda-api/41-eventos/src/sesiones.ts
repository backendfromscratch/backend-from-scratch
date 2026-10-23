// Las sesiones, en la tabla sesiones (migración 006). Una sesión es un id largo y al azar: quien lo
// tiene, ha iniciado sesión. Por eso el id viaja solo en la cookie, y la tabla guarda su hash.
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import { sesiones, usuarios } from './esquema.ts';
import type { Usuario } from './usuarios.ts';

// #region crear-sesion
// Una semana: después, hay que volver a iniciar sesión.
export const DURACION_SESION = 7 * 24 * 60 * 60; // en segundos

// 32 bytes al azar (256 bits): nadie puede adivinarlo ni probar todos. base64url lo escribe con
// letras, cifras, - y _, que caben en una cookie sin escapar nada.
// La hora de caducar la pone PostgreSQL: now() más la duración, la misma hora de creada_en.
export async function crearSesion(usuarioId: number): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await bd.insert(sesiones).values({
    idHash: hashDeId(id),
    usuarioId,
    expiraEn: sql`now() + make_interval(secs => ${DURACION_SESION})`,
  });
  return id;
}

// SHA-256, un hash rápido, y aquí está bien: el id es al azar y muy largo, así que no hay una lista
// de ids probables que probar, como sí la hay de contraseñas (lección 1).
const hashDeId = (id: string) => createHash('sha256').update(id).digest();
// #endregion crear-sesion

// #region buscar-sesion
// La cuenta de una sesión, o undefined si no existe o ha caducado. Una sesión caducada se borra en
// ese momento: así la tabla no se llena de sesiones viejas (en una tienda grande, además, un
// proceso las borraría cada noche).
export async function usuarioDeSesion(id: string): Promise<Usuario | undefined> {
  const [fila] = await bd
    .select({
      id: usuarios.id,
      email: usuarios.email,
      rol: usuarios.rol,
      expiraEn: sesiones.expiraEn,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(eq(sesiones.idHash, hashDeId(id)));
  if (fila === undefined) return undefined;
  if (fila.expiraEn <= new Date()) {
    await borrarSesion(id);
    return undefined;
  }
  return { id: fila.id, email: fila.email, rol: fila.rol };
}
// #endregion buscar-sesion

// #region borrar-sesion
// Cerrar sesión de verdad es borrarla aquí. Borrar la cookie no basta: quien tuviera una copia
// del id podría seguir usándolo.
export async function borrarSesion(id: string): Promise<void> {
  await bd.delete(sesiones).where(eq(sesiones.idHash, hashDeId(id)));
}
// #endregion borrar-sesion
