// Los datos de la tienda, en memoria: se pierden al parar el servidor. La base de datos llega
// en la Fase 5.
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

export const productos: Producto[] = [
  { id: 1, nombre: 'Camiseta', precioCentimos: 2000 },
  { id: 2, nombre: 'Taza', precioCentimos: 850 },
  { id: 3, nombre: 'Sudadera', precioCentimos: 3500 },
];

export const pedidos: Pedido[] = [];

export function buscarProducto(id: number): Producto | undefined {
  return productos.find((producto) => producto.id === id);
}

// El id ya no puede ser «cuántos hay + 1»: si se borra el 2 de [1, 2, 3], quedan dos, y el siguiente
// sería otra vez el 3. Un contador que solo sube no repite nunca un id.
let ultimoIdProducto = productos.length;

export function crearProducto(nombre: string, precioCentimos: number): Producto {
  ultimoIdProducto = ultimoIdProducto + 1;
  const producto: Producto = { id: ultimoIdProducto, nombre, precioCentimos };
  productos.push(producto);
  return producto;
}

// Devuelve false si no existía.
export function borrarProducto(id: number): boolean {
  const posicion = productos.findIndex((producto) => producto.id === id);
  if (posicion === -1) return false;
  productos.splice(posicion, 1);
  return true;
}

// #region eventos-procesados
// Los ids de los eventos de pago ya procesados, para no procesar dos veces el mismo.
export const eventosProcesados = new Set<string>();
// #endregion eventos-procesados

export function buscarPedido(id: number): Pedido | undefined {
  return pedidos.find((pedido) => pedido.id === id);
}

// toISOString() da siempre la fecha en UTC, sea cual sea la zona horaria del servidor.
export function crearPedido(productoId: number, cantidad: number, creadoEn = new Date()): Pedido {
  const pedido: Pedido = {
    id: pedidos.length + 1,
    productoId,
    cantidad,
    estado: 'pendiente',
    creadoEn: creadoEn.toISOString(),
  };
  pedidos.push(pedido);
  return pedido;
}

// 25 pedidos de ejemplo, para que haya algo que paginar. Los más antiguos ya están enviados; los
// del medio, pagados; los más nuevos, pendientes. Uno cada 7 horas desde el 1 de octubre.
const PRIMER_PEDIDO = new Date('2026-10-01T09:00:00Z').getTime();
const SIETE_HORAS = 7 * 60 * 60 * 1000;
for (let numero = 1; numero <= 25; numero++) {
  const creadoEn = new Date(PRIMER_PEDIDO + (numero - 1) * SIETE_HORAS);
  const pedido = crearPedido((numero % 3) + 1, (numero % 4) + 1, creadoEn);
  if (numero <= 12) pedido.estado = 'enviado';
  else if (numero <= 20) pedido.estado = 'pagado';
}

// Del más nuevo al más antiguo: el id más alto es el último que se creó. toSorted ordena una
// copia; la lista original no cambia.
export function pedidosMasNuevosPrimero(): Pedido[] {
  return pedidos.toSorted((a, b) => b.id - a.id);
}
