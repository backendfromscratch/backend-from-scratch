// Crea una clave de API y la enseña una sola vez. Ejecútalo con: npm run crear-clave -- <nombre>
// Por ejemplo: npm run crear-clave -- "Reparto Rápido"
// Desde la Fase 11, con un rol detrás (reparto, si no se dice): reparto, admin o catalogo.
// Por ejemplo: npm run crear-clave -- "Comparador de precios" catalogo
import { crearClave, ROLES_CLAVE, type RolClave } from '../src/claves.ts';
import { pool } from '../src/bd.ts';

const [nombre, rol = 'reparto'] = process.argv.slice(2);
const esRol = (texto: string): texto is RolClave =>
  (ROLES_CLAVE as readonly string[]).includes(texto);
if (!nombre || !esRol(rol)) {
  console.error(`Uso: npm run crear-clave -- <nombre> [${ROLES_CLAVE.join(' | ')}]`);
  process.exit(1);
}

try {
  const { id, clave } = await crearClave(nombre, rol);
  console.log(`Clave ${id}, para «${nombre}» (rol ${rol}):`);
  console.log(clave);
  console.log('Cópiala ahora: la tienda solo guarda su hash y no te la puede volver a enseñar.');
} finally {
  await pool.end();
}
