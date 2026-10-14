// Las cuentas de la tienda, en la tabla usuarios (migración 005).
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { bd } from './bd.ts';
import { hashear, verificar } from './contrasenas.ts';
import { usuarios } from './esquema.ts';

// Lo que la API enseña de una cuenta: nunca el hash.
export interface Usuario {
  id: number;
  email: string;
}

// #region crear-usuario
// Crea la cuenta con el hash de la contraseña. El email repetido lo detecta PostgreSQL, con el
// índice único de la migración 005 (23505): comprobarlo antes con un SELECT no bastaría, porque dos
// altas a la vez podrían pasar las dos la comprobación. Drizzle envuelve el error: va en cause.
export async function crearUsuario(
  email: string,
  contrasena: string,
): Promise<{ usuario: Usuario } | { error: 'email-en-uso' }> {
  const hashContrasena = await hashear(contrasena);
  try {
    const [usuario] = await bd
      .insert(usuarios)
      .values({ email, hashContrasena })
      .returning({ id: usuarios.id, email: usuarios.email });
    return { usuario: usuario! };
  } catch (error) {
    if (error instanceof Error && error.cause instanceof DatabaseError) {
      if (error.cause.code === '23505') return { error: 'email-en-uso' };
    }
    throw error;
  }
}
// #endregion crear-usuario

// #region comprobar-credenciales
// El hash de una contraseña al azar que nadie sabe. Sirve para que un email que no existe tarde lo
// mismo que uno que sí: sin él, la respuesta llegaría 20 ms antes, y midiendo el tiempo se sabría
// qué emails tienen cuenta.
const HASH_DE_RELLENO = await hashear(randomBytes(32).toString('hex'));

// Devuelve la cuenta si el email y la contraseña son de ella; si no, undefined, sin decir cuál de
// los dos falla. Una cuenta sin contraseña (entra con un proveedor, lección 4) tampoco entra así.
export async function comprobarCredenciales(
  email: string,
  contrasena: string,
): Promise<Usuario | undefined> {
  const [fila] = await bd
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${email})`);
  // Siempre se verifica una contraseña, exista la cuenta o no: el mismo trabajo, el mismo tiempo.
  const correcta = await verificar(contrasena, fila?.hashContrasena ?? HASH_DE_RELLENO);
  if (fila === undefined || fila.hashContrasena === null || !correcta) return undefined;
  return { id: fila.id, email: fila.email };
}
// #endregion comprobar-credenciales
