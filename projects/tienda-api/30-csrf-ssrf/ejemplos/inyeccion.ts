// Por qué un valor nunca se pega dentro de una consulta. Necesita la base de datos del .env;
// ejecútalo con: node --env-file=.env ejemplos/inyeccion.ts
// Es la inyección SQL, uno de los ataques más viejos y más comunes. Las funciones que pegan el texto
// están MAL a propósito, para verlo: ninguna ruta de la tienda las usa.
import { pool } from '../src/bd.ts';

// #region pegado
// MAL: el valor que manda el cliente, pegado dentro del texto de la consulta.
async function buscarPegando(nombre: string) {
  const consulta = `SELECT nombre FROM productos WHERE nombre = '${nombre}' ORDER BY id`;
  console.log(`  La consulta: ${consulta}`);
  const { rows } = await pool.query(consulta);
  return rows.map((fila) => fila.nombre);
}
// #endregion pegado

// #region parametro
// BIEN: la consulta lleva $1, y el valor viaja aparte. PostgreSQL recibe las dos cosas por
// separado y nunca lee el valor como SQL: busca un producto que se llame exactamente así.
async function buscarConParametro(nombre: string) {
  const consulta = 'SELECT nombre FROM productos WHERE nombre = $1 ORDER BY id';
  const { rows } = await pool.query(consulta, [nombre]);
  return rows.map((fila) => fila.nombre);
}
// #endregion parametro

// #region probar
// Lo que alguien escribe en el buscador de la tienda: primero, algo normal; después, un valor
// preparado para que su comilla cierre la de la consulta. Lo que va detrás, OR '1'='1', pasa a
// ser parte del SQL, y es cierto en todas las filas.
// La tercera va más lejos (Fase 6, lección 6): UNION añade a la respuesta las filas de otra
// consulta, de otra tabla. Con -- (un comentario en SQL), lo que quedaba de la consulta original
// deja de contar. Lo que vuelve ya no son productos: son los emails y los hashes de las cuentas.
const UNION = "x' UNION SELECT email || ' ' || hash_contrasena FROM usuarios --";
for (const busqueda of ['Taza', "x' OR '1'='1", UNION]) {
  console.log(`\nSe busca: ${busqueda}`);
  console.log('  Pegando el texto, encuentra:', await buscarPegando(busqueda));
  console.log('  Con un parámetro, encuentra:', await buscarConParametro(busqueda));
}
// #endregion probar

await pool.end();
