// Crea una cuenta admin con una contraseña al azar y la enseña una sola vez. En producción no hay
// cuentas de práctica (bd:datos:produccion): la primera cuenta es esta.
// Ejecútalo con: npm run crear-admin -- <email>
import { randomBytes } from 'node:crypto';
import { pool } from '../src/bd.ts';
import { esquemaCuentaNueva } from '../src/esquemas.ts';
import { crearUsuario } from '../src/usuarios.ts';

// El mismo esquema que el alta de la API: el email se valida igual aquí que allí.
const comprobado = esquemaCuentaNueva.shape.email.safeParse(process.argv[2]);
if (!comprobado.success) {
  console.error('Uso: npm run crear-admin -- <email>');
  console.error(`El email no es válido: ${comprobado.error.issues[0]?.message}`);
  process.exit(1);
}

try {
  // 18 bytes al azar, en base64url: 24 caracteres, unos 144 bits. Nadie tiene que recordarla.
  const contrasena = randomBytes(18).toString('base64url');
  const resultado = await crearUsuario(comprobado.data, contrasena, 'admin');
  if ('error' in resultado) {
    console.error(`Ya hay una cuenta con el email ${comprobado.data}: no se ha cambiado nada`);
    process.exitCode = 1;
  } else {
    console.log(`Cuenta admin creada: ${resultado.usuario.email}`);
    console.log(`Contraseña (guárdala ahora, no se vuelve a enseñar): ${contrasena}`);
  }
} finally {
  await pool.end();
}
