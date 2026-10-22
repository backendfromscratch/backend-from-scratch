// Crea una clave de API y la enseña una sola vez. Ejecútalo con: npm run crear-clave -- <nombre>
// Por ejemplo: npm run crear-clave -- "Reparto Rápido"
import { crearClave } from '../src/claves.ts';
import { pool } from '../src/bd.ts';

const nombre = process.argv[2];
if (!nombre) {
  console.error('Uso: npm run crear-clave -- <nombre>');
  process.exit(1);
}

try {
  const { id, clave } = await crearClave(nombre);
  console.log(`Clave ${id}, para «${nombre}»:`);
  console.log(clave);
  console.log('Cópiala ahora: la tienda solo guarda su hash y no te la puede volver a enseñar.');
} finally {
  await pool.end();
}
