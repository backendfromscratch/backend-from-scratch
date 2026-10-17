// El problema N+1: los productos con sus categorías, pedidos de dos formas. Con el log de Drizzle
// encendido se ve cada consulta que llega a la base de datos, y se cuentan. Necesita la base de
// datos del .env; ejecútalo con: node --env-file=.env ejemplos/n-mas-uno.ts
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '../src/bd.ts';
import * as esquema from '../src/esquema.ts';

const { categorias, productos, productosCategorias } = esquema;

// #region log
// Un Drizzle para este ejemplo, sobre el mismo pool, con un log propio: escribe cada consulta y
// la cuenta.
let consultas = 0;
const bd = drizzle({
  client: pool,
  schema: esquema,
  logger: {
    logQuery(consulta) {
      consultas++;
      console.log(`  SQL: ${consulta}`);
    },
  },
});
// #endregion log

// #region n-mas-uno
// MAL: una consulta para los productos y, después, otra por cada producto para sus categorías.
// Con 4 productos son 5 consultas; con 1000, 1001. Cada una es un viaje de ida y vuelta hasta la
// base de datos, y el bucle espera a que vuelva cada uno antes de lanzar el siguiente.
async function conNMasUno() {
  const lista = await bd.select().from(productos).orderBy(asc(productos.id));
  const resultado = [];
  for (const producto of lista) {
    const suyas = await bd
      .select({ nombre: categorias.nombre })
      .from(productosCategorias)
      .innerJoin(categorias, eq(categorias.id, productosCategorias.categoriaId))
      .where(eq(productosCategorias.productoId, producto.id))
      .orderBy(asc(categorias.id));
    resultado.push({ nombre: producto.nombre, categorias: suyas.map((fila) => fila.nombre) });
  }
  return resultado;
}
// #endregion n-mas-uno

// #region una-consulta
// BIEN: una sola consulta. with le pide a Drizzle los productos con sus categorías, y Drizzle
// escribe un SQL que lo trae todo de una vez, haya 4 productos o 1000.
async function conUnaConsulta() {
  const lista = await bd.query.productos.findMany({
    orderBy: asc(productos.id),
    with: {
      categorias: { with: { categoria: true }, orderBy: asc(productosCategorias.categoriaId) },
    },
  });
  return lista.map((producto) => ({
    nombre: producto.nombre,
    categorias: producto.categorias.map((fila) => fila.categoria.nombre),
  }));
}
// #endregion una-consulta

// #region comparar
for (const [titulo, listar] of [
  ['Con N+1', conNMasUno],
  ['Con una consulta', conUnaConsulta],
] as const) {
  console.log(`== ${titulo}`);
  consultas = 0;
  const resultado = await listar();
  console.log(`Resultado: ${JSON.stringify(resultado)}`);
  console.log(`Consultas a la base de datos: ${consultas}\n`);
}
// #endregion comparar

await pool.end();
