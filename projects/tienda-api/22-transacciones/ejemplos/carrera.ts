// Diez personas compran a la vez la última taza que queda. Dos formas de venderla: una vende diez
// tazas que no existen, la otra solo una. Necesita la base de datos del .env; ejecútalo con:
// node --env-file=.env ejemplos/carrera.ts
import { setTimeout as esperar } from 'node:timers/promises';
import { pool } from '../src/bd.ts';

const COMPRADORES = 10;

// #region mal
// MAL: leer el stock y, en otra consulta, escribir el nuevo. Entre una y otra pasa un rato (aquí,
// 50 ms a propósito; en un servidor de verdad, lo que tarde en hacer otras cosas): todos leen
// «queda 1» antes de que nadie escriba, y todos venden.
async function comprarMal(productoId: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT stock FROM productos WHERE id = $1', [productoId]);
  const stock = rows[0].stock;
  if (stock < 1) return false;
  await esperar(50);
  await pool.query('UPDATE productos SET stock = $2 WHERE id = $1', [productoId, stock - 1]);
  return true;
}
// #endregion mal

// #region bien
// BIEN: comprobar y quitar en la misma consulta. Mientras PostgreSQL cambia la fila, la bloquea: el
// siguiente comprador espera, y después mira el stock que ha dejado el anterior.
async function comprarBien(productoId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE productos SET stock = stock - 1 WHERE id = $1 AND stock >= 1',
    [productoId],
  );
  return rowCount === 1;
}
// #endregion bien

// #region carrera
// Una taza de prueba con stock 1, y todos los compradores a la vez (Promise.all no espera a que
// termine uno para lanzar el siguiente).
async function carrera(nombre: string, comprar: (productoId: number) => Promise<boolean>) {
  const { rows } = await pool.query(
    `INSERT INTO productos (nombre, precio_centimos, stock)
     VALUES ('Taza de la carrera', 850, 1) RETURNING id`,
  );
  const id = rows[0].id;
  const compras = await Promise.all(Array.from({ length: COMPRADORES }, () => comprar(id)));
  const vendidas = compras.filter((vendida) => vendida).length;
  const final = await pool.query('SELECT stock FROM productos WHERE id = $1', [id]);
  console.log(
    `${nombre}: quedaba 1 taza y se han vendido ${vendidas}. Stock: ${final.rows[0].stock}`,
  );
  await pool.query('DELETE FROM productos WHERE id = $1', [id]); // la taza de prueba se va
}

await carrera('Mal', comprarMal);
await carrera('Bien', comprarBien);
// #endregion carrera

await pool.end();
