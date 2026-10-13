// Los datos de la tienda, en memoria: se pierden al parar el servidor. La base de datos llega
// en la Fase 5.
export interface Producto {
  id: number;
  nombre: string;
  precio: number;
}

// #region estado
// Un pedido cancelado no se borra: sigue existiendo, con su estado. Así se puede consultar después.
export type EstadoPedido = 'pendiente' | 'pagado' | 'enviado' | 'cancelado';

export interface Pedido {
  id: number;
  productoId: number;
  cantidad: number;
  estado: EstadoPedido;
}
// #endregion estado

export const productos: Producto[] = [
  { id: 1, nombre: 'Camiseta', precio: 20 },
  { id: 2, nombre: 'Taza', precio: 8.5 },
  { id: 3, nombre: 'Sudadera', precio: 35 },
];

export const pedidos: Pedido[] = [];

export function buscarProducto(id: number): Producto | undefined {
  return productos.find((producto) => producto.id === id);
}

// #region borrar-producto
// El id ya no puede ser «cuántos hay + 1»: si se borra el 2 de [1, 2, 3], quedan dos, y el siguiente
// sería otra vez el 3. Un contador que solo sube no repite nunca un id.
let ultimoIdProducto = productos.length;

export function crearProducto(nombre: string, precio: number): Producto {
  ultimoIdProducto = ultimoIdProducto + 1;
  const producto: Producto = { id: ultimoIdProducto, nombre, precio };
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
// #endregion borrar-producto

export function buscarPedido(id: number): Pedido | undefined {
  return pedidos.find((pedido) => pedido.id === id);
}

export function crearPedido(productoId: number, cantidad: number): Pedido {
  const pedido: Pedido = { id: pedidos.length + 1, productoId, cantidad, estado: 'pendiente' };
  pedidos.push(pedido);
  return pedido;
}
