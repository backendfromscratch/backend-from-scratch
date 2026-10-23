// Los datos de la tienda, en PostgreSQL, ahora con Drizzle: las consultas se escriben en
// TypeScript, con las tablas de esquema.ts, y Drizzle las convierte en SQL con parámetros ($1, $2…).
// TypeScript sabe qué columnas tiene cada fila y de qué tipo son.
import { EventEmitter } from 'node:events';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import {
  categorias,
  eventosProcesados,
  pedidos,
  productos,
  productosCategorias,
} from './esquema.ts';

// Desde la versión 2, el precio va en céntimos enteros: 850, no 8.5. Con decimales, las cuentas
// con dinero acaban fallando por un céntimo (lección 6).
// stock: cuántas unidades quedan (migración 002). categorias: los nombres de sus categorías. Los
// dos, solo en la versión 2: la 1 no cambia.
export interface Producto {
  id: number;
  nombre: string;
  precioCentimos: number;
  stock: number;
  categorias: string[];
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
// Drizzle ya devuelve cada fila con los nombres de la API (precioCentimos, creadoEn): los pone
// esquema.ts. Solo queda la fecha: Drizzle da un Date de JavaScript, y la API, texto. toISOString()
// lo escribe en ISO 8601 y siempre en UTC, sea cual sea la zona horaria del servidor.
export type FilaPedido = typeof pedidos.$inferSelect;
export const aPedido = (fila: FilaPedido): Pedido => ({
  ...fila,
  creadoEn: fila.creadoEn.toISOString(),
});
// #endregion columnas

// #region listar-productos
// with: los productos con sus categorías, en una sola consulta (lección 9: el problema N+1).
// Drizzle trae cada producto con sus filas de productos_categorias y, en cada una, su categoría.
const conCategorias = {
  categorias: {
    with: { categoria: true },
    orderBy: asc(productosCategorias.categoriaId),
  },
} as const;

// Lo que llega de una consulta con conCategorias, como lo da la API: de cada categoría, el nombre.
type ProductoConCategorias = typeof productos.$inferSelect & {
  categorias: { categoria: { nombre: string } }[];
};

function aProducto({ categorias, ...producto }: ProductoConCategorias): Producto {
  return { ...producto, categorias: categorias.map((fila) => fila.categoria.nombre) };
}

// Los ids de los productos de una categoría, sin importar mayúsculas: ropa, Ropa o ROPA. Es una
// consulta dentro de otra (una subconsulta); ${categoria} es un parámetro, como $1.
const deLaCategoria = (categoria: string) =>
  bd
    .select({ id: productosCategorias.productoId })
    .from(productosCategorias)
    .innerJoin(categorias, eq(categorias.id, productosCategorias.categoriaId))
    .where(sql`lower(${categorias.nombre}) = lower(${categoria})`);

// El orden, de una lista fija: asc y desc son funciones de Drizzle, no texto del cliente.
const ORDEN = {
  precio: [asc(productos.precioCentimos), asc(productos.id)],
  '-precio': [desc(productos.precioCentimos), asc(productos.id)],
};

export async function listarProductos(
  filtro: { maxCentimos?: number; orden?: keyof typeof ORDEN; categoria?: string } = {},
): Promise<Producto[]> {
  // and() se salta las condiciones que son undefined: solo filtra por lo que ha llegado.
  const filas = await bd.query.productos.findMany({
    where: and(
      filtro.maxCentimos === undefined
        ? undefined
        : lte(productos.precioCentimos, filtro.maxCentimos),
      filtro.categoria === undefined
        ? undefined
        : inArray(productos.id, deLaCategoria(filtro.categoria)),
    ),
    orderBy: filtro.orden ? ORDEN[filtro.orden] : [asc(productos.id)],
    with: conCategorias,
  });
  return filas.map(aProducto);
}
// #endregion listar-productos

// #region buscar-producto
// findFirst: la primera fila que cumpla where, o undefined si no hay ninguna.
export async function buscarProducto(id: number): Promise<Producto | undefined> {
  const fila = await bd.query.productos.findFirst({
    where: eq(productos.id, id),
    with: conCategorias,
  });
  return fila && aProducto(fila);
}
// #endregion buscar-producto

// #region crear-producto
// El id lo pone PostgreSQL y el stock empieza en 0 (el DEFAULT de la columna). returning() es el
// RETURNING de SQL: la fila tal y como ha quedado. Un producto nuevo no tiene categorías.
export async function crearProducto(nombre: string, precioCentimos: number): Promise<Producto> {
  const [producto] = await bd.insert(productos).values({ nombre, precioCentimos }).returning();
  return { ...producto!, categorias: [] };
}
// #endregion crear-producto

// Devuelve false si no existía. Si tiene pedidos, PostgreSQL no deja borrarlo y lanza un error
// (23503), que se convierte en un 409 (problemas.ts).
export async function borrarProducto(id: number): Promise<boolean> {
  const borrados = await bd.delete(productos).where(eq(productos.id, id)).returning();
  return borrados.length === 1;
}

// #region eventos-procesados
// Apunta el id de un aviso de pago. Si ya estaba, la clave primaria lo impide y
// onConflictDoNothing (ON CONFLICT DO NOTHING) hace que no pase nada: returning no devuelve
// ninguna fila. Es una sola consulta, así que aunque el mismo aviso llegue dos veces a la vez, solo
// una lo apunta. Devuelve si era nuevo.
export async function apuntarEvento(id: string): Promise<boolean> {
  const apuntados = await bd
    .insert(eventosProcesados)
    .values({ id })
    .onConflictDoNothing()
    .returning();
  return apuntados.length === 1;
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
  // and() se salta la condición que es undefined: sin desde, solo mira el id.
  const [fila] = await bd
    .update(pedidos)
    .set({ estado })
    .where(and(eq(pedidos.id, id), desde === undefined ? undefined : eq(pedidos.estado, desde)))
    .returning();
  if (fila === undefined) return undefined;
  const pedido = aPedido(fila);
  cambiosDePedidos.emit('cambio', pedido);
  return pedido;
}
// #endregion avisos

export async function buscarPedido(id: number): Promise<Pedido | undefined> {
  const [fila] = await bd.select().from(pedidos).where(eq(pedidos.id, id));
  return fila && aPedido(fila);
}

// #region crear-pedido
// Lo que puede pasar al hacer un pedido: sale bien, el producto no existe o no queda bastante.
export type ResultadoPedido =
  { pedido: Pedido } | { error: 'no-existe' } | { error: 'sin-stock'; quedan: number };

// Quitar el stock y guardar el pedido, en una transacción: o las dos cosas, o ninguna. tx es la
// transacción: todo lo que va por tx va por la misma conexión.
export async function crearPedido(productoId: number, cantidad: number): Promise<ResultadoPedido> {
  return bd.transaction(async (tx): Promise<ResultadoPedido> => {
    // El UPDATE condicional de la lección 8, con el constructor de consultas: se lee casi igual que
    // el SQL (SET stock = stock - $2 WHERE id = $1 AND stock >= $2). Para la resta, un trozo de
    // SQL (sql`…`): con Drizzle, lo que importa aquí, que la comprobación y el cambio van en la
    // misma consulta, sigue a la vista.
    const quitado = await tx
      .update(productos)
      .set({ stock: sql`${productos.stock} - ${cantidad}` })
      .where(and(eq(productos.id, productoId), gte(productos.stock, cantidad)))
      .returning({ stock: productos.stock });
    if (quitado.length === 0) {
      // No ha cambiado ninguna fila: o no existe el producto, o no queda bastante. ¿Cuál?
      const [producto] = await tx
        .select({ stock: productos.stock })
        .from(productos)
        .where(eq(productos.id, productoId));
      return producto ? { error: 'sin-stock', quedan: producto.stock } : { error: 'no-existe' };
    }
    // now(): la hora en la que empezó la transacción. PostgreSQL la guarda con microsegundos, pero
    // la API la da con milisegundos (.000Z): date_trunc la deja en milisegundos, para que el
    // cursor, que lleva la fecha, señale exactamente este pedido.
    const [fila] = await tx
      .insert(pedidos)
      .values({
        productoId,
        cantidad,
        estado: 'pendiente',
        creadoEn: sql`date_trunc('milliseconds', now())`,
      })
      .returning();
    return { pedido: aPedido(fila!) };
  });
}
// #endregion crear-pedido

// #region cancelar-pedido
// Cancelar devuelve el stock, en la misma transacción que el cambio de estado. El UPDATE solo
// cancela un pedido pendiente o pagado: si llegan dos cancelaciones a la vez, la segunda ya no lo
// encuentra, y el stock se devuelve una sola vez.
export async function cancelarPedido(id: number): Promise<Pedido> {
  const cancelado = await bd.transaction(async (tx) => {
    const [fila] = await tx
      .update(pedidos)
      .set({ estado: 'cancelado' })
      .where(and(eq(pedidos.id, id), inArray(pedidos.estado, ['pendiente', 'pagado'])))
      .returning();
    if (fila === undefined) return undefined; // ya estaba cancelado, o enviado: nada que devolver
    await tx
      .update(productos)
      .set({ stock: sql`${productos.stock} + ${fila.cantidad}` })
      .where(eq(productos.id, fila.productoId));
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
  return bd.transaction(async (tx): Promise<ResultadoCambio> => {
    // for('update') es el FOR UPDATE de SQL: bloquea la fila del pedido hasta el COMMIT. Si a la
    // vez llega un pago o una cancelación, espera a que esto acabe (o esto espera a que acabe lo
    // otro, y lee lo que ha dejado). Primero el pedido y después el producto, en el mismo orden que
    // cancelarPedido: si cada una bloqueara primero una fila distinta, las dos se quedarían
    // esperando a la otra.
    const [fila] = await tx.select().from(pedidos).where(eq(pedidos.id, id)).for('update');
    const pedido = fila!; // existe: la ruta ya lo ha buscado, y los pedidos no se borran
    // La ruta ya ha mirado el estado, pero antes del bloqueo: entretanto lo pueden haber pagado.
    if (pedido.estado !== 'pendiente') return { error: 'estado', estado: pedido.estado };
    const diferencia = cantidad - pedido.cantidad;
    if (diferencia > 0) {
      // Las de más, con el mismo UPDATE condicional que al hacer el pedido.
      const quitado = await tx
        .update(productos)
        .set({ stock: sql`${productos.stock} - ${diferencia}` })
        .where(and(eq(productos.id, pedido.productoId), gte(productos.stock, diferencia)))
        .returning({ stock: productos.stock });
      if (quitado.length === 0) {
        const [producto] = await tx
          .select({ stock: productos.stock })
          .from(productos)
          .where(eq(productos.id, pedido.productoId));
        return { error: 'sin-stock', mas: diferencia, quedan: producto!.stock };
      }
    } else if (diferencia < 0) {
      await tx
        .update(productos)
        .set({ stock: sql`${productos.stock} + ${-diferencia}` })
        .where(eq(productos.id, pedido.productoId));
    }
    const [cambiado] = await tx
      .update(pedidos)
      .set({ cantidad })
      .where(eq(pedidos.id, id))
      .returning();
    return { pedido: aPedido(cambiado!) };
  });
}
