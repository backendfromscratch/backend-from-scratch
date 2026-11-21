// Las cuentas de la tienda, en la tabla usuarios (migración 005).
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { bd } from './bd.ts';
import { hashear, verificar } from './contrasenas.ts';
import { usuarios } from './esquema.ts';
import type { Rol } from './permisos.ts';
import type { Identidad } from './proveedor.ts';

// Lo que la API enseña de una cuenta: nunca el hash.
export interface Usuario {
  id: number;
  email: string;
  rol: Rol;
}

// #region crear-usuario
// Crea la cuenta con el hash de la contraseña. El email repetido lo detecta PostgreSQL, con el
// índice único de la migración 005 (23505): comprobarlo antes con un SELECT no bastaría, porque dos
// altas a la vez podrían pasar las dos la comprobación. Drizzle envuelve el error: va en cause.
// El rol es cliente salvo que se pida otro (crear-admin pide admin): va en el mismo INSERT, así la
// cuenta nunca existe, ni un instante, con un rol que no es el suyo.
export async function crearUsuario(
  email: string,
  contrasena: string,
  rol: Rol = 'cliente',
): Promise<{ usuario: Usuario } | { error: 'email-en-uso' }> {
  const hashContrasena = await hashear(contrasena);
  try {
    const [usuario] = await bd
      .insert(usuarios)
      .values({ email, hashContrasena, rol })
      .returning({ id: usuarios.id, email: usuarios.email, rol: usuarios.rol });
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
  return { id: fila.id, email: fila.email, rol: fila.rol };
}
// #endregion comprobar-credenciales

// #region usuario-del-proveedor
// La cuenta de quien vuelve del proveedor de identidad:
// 1. Si su sub ya está en una cuenta, es esa: el sub no cambia aunque cambie el email.
// 2. Si no, y ya hay una cuenta con su email, se une a ella (se le apunta el sub), pero solo si el
//    proveedor dice que ha comprobado que el email es suyo. Si no, cualquiera podría crear en el
//    proveedor una cuenta con el email de Ana y entrar en la de Ana.
// 3. Si no hay ninguna, se crea, sin contraseña.
export async function usuarioDelProveedor(
  identidad: Identidad,
): Promise<{ usuario: Usuario } | { error: 'sin-email' | 'email-sin-verificar' }> {
  const columnas = { id: usuarios.id, email: usuarios.email, rol: usuarios.rol };
  // #region buscar-o-unir
  const [conSub] = await bd
    .select(columnas)
    .from(usuarios)
    .where(eq(usuarios.subProveedor, identidad.sub));
  if (conSub) return { usuario: conSub };
  if (identidad.email === undefined) return { error: 'sin-email' };

  const [conEmail] = await bd
    .select(columnas)
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${identidad.email})`);
  if (conEmail) {
    if (!identidad.emailVerificado) return { error: 'email-sin-verificar' };
    await bd
      .update(usuarios)
      .set({ subProveedor: identidad.sub })
      .where(eq(usuarios.id, conEmail.id));
    return { usuario: conEmail };
  }
  // #endregion buscar-o-unir

  const [nuevo] = await bd
    .insert(usuarios)
    .values({ email: identidad.email, subProveedor: identidad.sub })
    .returning(columnas);
  return { usuario: nuevo! };
}
// #endregion usuario-del-proveedor
