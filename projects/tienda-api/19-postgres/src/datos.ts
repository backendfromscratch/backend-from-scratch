// Los datos de la tienda, en PostgreSQL: ya no se pierden al parar el servidor. Cada función es una
// consulta, y todas son async: la base de datos es otro programa, al otro lado de una conexión, y
// hay que esperar su respuesta.
import { EventEmitter } from 'node:events';
import { pool } from './bd.ts';

// Desde la versión 2, el precio va en céntimos enteros: 850, no 8.5. Con decimales, las cuentas
// con dinero acaban fallando por un céntimo (lección 6).
export interface Producto {
  id: number;
  nombre: string;
  precioCentimos: number;
}

// Un pedido cancelado no se borra: sigue existiendo, con su estado. Así se puede consultar después.
export type EstadoPedido = 'pendiente' | 'pagado' | 'enviado' | 'cancelado';

// creadoEn: cuándo se hizo, como texto en ISO 8601 y en UTC (la Z del final): 2026-10-13T09:30:00.000Z.
// JSON no tiene fechas; así cualquier cliente, en cualquier zona horaria, la lee igual.
export interface Pedido {
  id: number;
  productoId: number;
  cantidad: number;
  estado: EstadoPedido;
  creadoEn: string;
}

// #region columnas
// Las columnas, con el nombre que tienen en la API: precio_centimos AS "precioCentimos". Las
// comillas hacen que PostgreSQL respete la mayúscula (sin ellas, la pasaría a minúscula). Así,
// cada fila ya es un producto tal y como sale en el JSON. Es texto nuestro, fijo: nada de lo que
// manda el cliente se pega nunca en una consulta.
const PRODUCTO = 'id, nombre, precio_centimos AS "precioCentimos"';
const PEDIDO = 'id, producto_id AS "productoId", cantidad, estado, creado_en AS "creadoEn"';

// pg convierte cada timestamptz en un Date de JavaScript. La API lo da como texto: toISOString()
// lo escribe en ISO 8601 y siempre en UTC, sea cual sea la zona horaria del servidor.
type FilaPedido = Omit<Pedido, 'creadoEn'> & { creadoEn: Date };
const aPedido = (fila: FilaPedido): Pedido => ({ ...fila, creadoEn: fila.creadoEn.toISOString() });
// #endregion columnas

// #region listar-productos
// El orden no puede ir en un parámetro: un parámetro es siempre un valor, nunca un trozo de SQL.
// Por eso se elige de esta lista fija, y no se escribe lo que manda el cliente.
const ORDEN = { precio: 'precio_centimos, id', '-precio': 'precio_centimos DESC, id' };

export async function listarProductos(
  filtro: { maxCentimos?: number; orden?: keyof typeof ORDEN } = {},
): Promise<Producto[]> {
  // $1::integer IS NULL: si no hay filtro (null), la condición es cierta para todos.
  const { rows } = await pool.query<Producto>(
    `SELECT ${PRODUCTO} FROM productos
     WHERE $1::integer IS NULL OR precio_centimos <= $1
     ORDER BY ${filtro.orden ? ORDEN[filtro.orden] : 'id'}`,
    [filtro.maxCentimos ?? null],
  );
  return rows;
}
// #endregion listar-productos

// #region buscar-producto
// $1 es un parámetro: la consulta y el valor viajan por separado, y PostgreSQL nunca lee el valor
// como SQL. Si no hay ninguna fila, rows[0] es undefined.
export async function buscarProducto(id: number): Promise<Producto | undefined> {
  const { rows } = await pool.query<Producto>(`SELECT ${PRODUCTO} FROM productos WHERE id = $1`, [
    id,
  ]);
  return rows[0];
}
// #endregion buscar-producto

// #region crear-producto
// El id ya no lo lleva un contador: lo pone PostgreSQL (GENERATED ALWAYS AS IDENTITY) y no se
// repite nunca, aunque se borren productos. RETURNING devuelve la fila tal y como ha quedado.
export async function crearProducto(nombre: string, precioCentimos: number): Promise<Producto> {
  const { rows } = await pool.query<Producto>(
    `INSERT INTO productos (nombre, precio_centimos) VALUES ($1, $2) RETURNING ${PRODUCTO}`,
    [nombre, precioCentimos],
  );
  return rows[0]!;
}
// #endregion crear-producto

// Devuelve false si no existía. Si tiene pedidos, PostgreSQL no deja borrarlo y lanza un error
// (23503), que se convierte en un 409 (problemas.ts).
export async function borrarProducto(id: number): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM productos WHERE id = $1', [id]);
  return rowCount === 1;
}

// #region eventos-procesados
// Apunta el id de un aviso de pago. Si ya estaba, la clave primaria lo impide y ON CONFLICT DO
// NOTHING hace que no pase nada: RETURNING no devuelve ninguna fila. Es una sola consulta, así que
// aunque el mismo aviso llegue dos veces a la vez, solo una lo apunta. Devuelve si era nuevo.
export async function apuntarEvento(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'INSERT INTO eventos_procesados (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
    [id],
  );
  return rowCount === 1;
}
// #endregion eventos-procesados

// #region avisos
// Avisa cada vez que un pedido cambia de estado. Quien quiera enterarse (cada conexión que sigue
// un pedido, en v2.ts) se apunta con .on('cambio', …) y se borra con .off cuando se va. Sigue en
// memoria: son conexiones abiertas con este servidor, no datos que guardar.
export const cambiosDePedidos = new EventEmitter<{ cambio: [Pedido] }>();
// Sin límite de oyentes: cada conexión abierta es uno, y puede haber muchas.
cambiosDePedidos.setMaxListeners(0);

// Cambiar el estado siempre por aquí, para que nadie se pierda el aviso: primero se guarda en la
// base de datos y después se avisa.
export async function cambiarEstado(id: number, estado: EstadoPedido): Promise<Pedido> {
  const { rows } = await pool.query<FilaPedido>(
    `UPDATE pedidos SET estado = $2 WHERE id = $1 RETURNING ${PEDIDO}`,
    [id, estado],
  );
  const pedido = aPedido(rows[0]!);
  cambiosDePedidos.emit('cambio', pedido);
  return pedido;
}
// #endregion avisos

export async function buscarPedido(id: number): Promise<Pedido | undefined> {
  const { rows } = await pool.query<FilaPedido>(`SELECT ${PEDIDO} FROM pedidos WHERE id = $1`, [
    id,
  ]);
  return rows[0] && aPedido(rows[0]);
}

// #region crear-pedido
// now(): la hora del servidor de base de datos, en el momento de guardarlo.
export async function crearPedido(productoId: number, cantidad: number): Promise<Pedido> {
  const { rows } = await pool.query<FilaPedido>(
    `INSERT INTO pedidos (producto_id, cantidad, estado, creado_en)
     VALUES ($1, $2, 'pendiente', now())
     RETURNING ${PEDIDO}`,
    [productoId, cantidad],
  );
  return aPedido(rows[0]!);
}
// #endregion crear-pedido

export async function cambiarCantidad(id: number, cantidad: number): Promise<Pedido> {
  const { rows } = await pool.query<FilaPedido>(
    `UPDATE pedidos SET cantidad = $2 WHERE id = $1 RETURNING ${PEDIDO}`,
    [id, cantidad],
  );
  return aPedido(rows[0]!);
}

// Del más nuevo al más antiguo: el id más alto es el último que se creó. Con estado, solo los de
// ese estado. Trae todos: la página se corta después (paginacion.ts).
export async function pedidosMasNuevosPrimero(estado?: EstadoPedido): Promise<Pedido[]> {
  const { rows } = await pool.query<FilaPedido>(
    `SELECT ${PEDIDO} FROM pedidos WHERE $1::text IS NULL OR estado = $1 ORDER BY id DESC`,
    [estado ?? null],
  );
  return rows.map(aPedido);
}
