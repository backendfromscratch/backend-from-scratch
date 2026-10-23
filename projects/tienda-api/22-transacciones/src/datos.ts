// Los datos de la tienda, en PostgreSQL: ya no se pierden al parar el servidor. Cada función es una
// consulta, y todas son async: la base de datos es otro programa, al otro lado de una conexión, y
// hay que esperar su respuesta.
import { EventEmitter } from 'node:events';
import { enTransaccion, pool } from './bd.ts';

// Desde la versión 2, el precio va en céntimos enteros: 850, no 8.5. Con decimales, las cuentas
// con dinero acaban fallando por un céntimo (lección 6).
// stock: cuántas unidades quedan (migración 002). Solo lo enseña la versión 2: la 1 no cambia.
export interface Producto {
  id: number;
  nombre: string;
  precioCentimos: number;
  stock: number;
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
const PRODUCTO = 'id, nombre, precio_centimos AS "precioCentimos", stock';
export const PEDIDO = 'id, producto_id AS "productoId", cantidad, estado, creado_en AS "creadoEn"';

// pg convierte cada timestamptz en un Date de JavaScript. La API lo da como texto: toISOString()
// lo escribe en ISO 8601 y siempre en UTC, sea cual sea la zona horaria del servidor.
export type FilaPedido = Omit<Pedido, 'creadoEn'> & { creadoEn: Date };
export const aPedido = (fila: FilaPedido): Pedido => ({
  ...fila,
  creadoEn: fila.creadoEn.toISOString(),
});
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
// repite nunca, aunque se borren productos. El stock empieza en 0 (el DEFAULT de la columna).
// RETURNING devuelve la fila tal y como ha quedado.
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

// Cambiar el estado siempre por aquí (o con cancelarPedido, que también avisa), para que nadie se
// pierda el aviso: primero se guarda en la base de datos y después se avisa. Con desde, solo lo
// cambia si el pedido sigue en ese estado, en el mismo UPDATE (como al quitar el stock): si otra
// petición lo ha cambiado antes, una cancelación por ejemplo, no cambia nada, no avisa y devuelve
// undefined.
export async function cambiarEstado(
  id: number,
  estado: EstadoPedido,
  desde?: EstadoPedido,
): Promise<Pedido | undefined> {
  // $3::text IS NULL: sin desde, la condición se cumple siempre.
  const { rows } = await pool.query<FilaPedido>(
    `UPDATE pedidos SET estado = $2 WHERE id = $1 AND ($3::text IS NULL OR estado = $3)
     RETURNING ${PEDIDO}`,
    [id, estado, desde ?? null],
  );
  if (rows[0] === undefined) return undefined;
  const pedido = aPedido(rows[0]);
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
// Lo que puede pasar al hacer un pedido: sale bien, el producto no existe o no queda bastante.
export type ResultadoPedido =
  { pedido: Pedido } | { error: 'no-existe' } | { error: 'sin-stock'; quedan: number };

// #region quitar-stock
// Quitar el stock y guardar el pedido, en una transacción: o las dos cosas, o ninguna.
export async function crearPedido(productoId: number, cantidad: number): Promise<ResultadoPedido> {
  return enTransaccion(async (cliente) => {
    // Comprobar que hay bastante y quitarlo, en la misma consulta (WHERE stock >= $2). Si llegan dos
    // pedidos a la vez, PostgreSQL bloquea la fila del producto mientras el primero la cambia: el
    // segundo espera y mira el stock que ha dejado el primero. Nunca se vende lo que no hay.
    const quitado = await cliente.query(
      'UPDATE productos SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
      [productoId, cantidad],
    );
    if (quitado.rowCount === 0) {
      // No ha cambiado ninguna fila: o no existe el producto, o no queda bastante. ¿Cuál?
      const { rows } = await cliente.query<{ stock: number }>(
        'SELECT stock FROM productos WHERE id = $1',
        [productoId],
      );
      return rows[0] ? { error: 'sin-stock', quedan: rows[0].stock } : { error: 'no-existe' };
    }
    // #endregion quitar-stock
    // now(): la hora en la que empezó la transacción. PostgreSQL la guarda con microsegundos, pero
    // la API la da con milisegundos (.000Z): date_trunc la deja en milisegundos, para que el
    // cursor, que lleva la fecha, señale exactamente este pedido.
    const { rows } = await cliente.query<FilaPedido>(
      `INSERT INTO pedidos (producto_id, cantidad, estado, creado_en)
       VALUES ($1, $2, 'pendiente', date_trunc('milliseconds', now()))
       RETURNING ${PEDIDO}`,
      [productoId, cantidad],
    );
    return { pedido: aPedido(rows[0]!) };
  });
}
// #endregion crear-pedido

// #region cancelar-pedido
// Cancelar devuelve el stock, en la misma transacción que el cambio de estado. El UPDATE solo
// cancela un pedido pendiente o pagado: si llegan dos cancelaciones a la vez, la segunda ya no lo
// encuentra, y el stock se devuelve una sola vez.
export async function cancelarPedido(id: number): Promise<Pedido> {
  const cancelado = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query<FilaPedido>(
      `UPDATE pedidos SET estado = 'cancelado'
       WHERE id = $1 AND estado IN ('pendiente', 'pagado')
       RETURNING ${PEDIDO}`,
      [id],
    );
    const fila = rows[0];
    if (fila === undefined) return undefined; // ya estaba cancelado, o enviado: nada que devolver
    await cliente.query('UPDATE productos SET stock = stock + $2 WHERE id = $1', [
      fila.productoId,
      fila.cantidad,
    ]);
    return aPedido(fila);
  });
  if (cancelado === undefined) return (await buscarPedido(id))!;
  // El aviso, después del COMMIT: quien lo reciba ya puede leer el cambio en la base de datos.
  cambiosDePedidos.emit('cambio', cancelado);
  return cancelado;
}
// #endregion cancelar-pedido

// Lo que puede pasar al cambiar la cantidad: sale bien, el pedido ya no está pendiente o no queda
// bastante stock para las unidades de más (mas: cuántas se piden de más).
export type ResultadoCambio =
  | { pedido: Pedido }
  | { error: 'estado'; estado: EstadoPedido }
  | { error: 'sin-stock'; mas: number; quedan: number };

// Cambiar la cantidad también cambia el stock, en la misma transacción: si se piden más, se quitan
// las de más (si quedan); si se piden menos, se devuelven las de menos.
export async function cambiarCantidad(id: number, cantidad: number): Promise<ResultadoCambio> {
  return enTransaccion(async (cliente): Promise<ResultadoCambio> => {
    // FOR UPDATE bloquea la fila del pedido hasta el COMMIT: si a la vez llega un pago o una
    // cancelación, espera a que esto acabe (o esto espera a que acabe lo otro, y lee lo que ha
    // dejado). Primero el pedido y después el producto, en el mismo orden que cancelarPedido: si
    // cada una bloqueara primero una fila distinta, las dos se quedarían esperando a la otra.
    const { rows } = await cliente.query<FilaPedido>(
      `SELECT ${PEDIDO} FROM pedidos WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const fila = rows[0]!; // existe: la ruta ya lo ha buscado, y los pedidos no se borran
    // La ruta ya ha mirado el estado, pero antes del bloqueo: entretanto lo pueden haber pagado.
    if (fila.estado !== 'pendiente') return { error: 'estado', estado: fila.estado };
    const diferencia = cantidad - fila.cantidad;
    if (diferencia > 0) {
      // Las de más, con el mismo UPDATE condicional que al hacer el pedido.
      const quitado = await cliente.query(
        'UPDATE productos SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
        [fila.productoId, diferencia],
      );
      if (quitado.rowCount === 0) {
        const { rows: producto } = await cliente.query<{ stock: number }>(
          'SELECT stock FROM productos WHERE id = $1',
          [fila.productoId],
        );
        return { error: 'sin-stock', mas: diferencia, quedan: producto[0]!.stock };
      }
    } else if (diferencia < 0) {
      await cliente.query('UPDATE productos SET stock = stock + $2 WHERE id = $1', [
        fila.productoId,
        -diferencia,
      ]);
    }
    const { rows: cambiado } = await cliente.query<FilaPedido>(
      `UPDATE pedidos SET cantidad = $2 WHERE id = $1 RETURNING ${PEDIDO}`,
      [id, cantidad],
    );
    return { pedido: aPedido(cambiado[0]!) };
  });
}
