// Las cuentas de la tienda, en la tabla usuarios (migración 005).
import { DatabaseError } from 'pg';
import { bd } from './bd.ts';
import { hashear } from './contrasenas.ts';
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
