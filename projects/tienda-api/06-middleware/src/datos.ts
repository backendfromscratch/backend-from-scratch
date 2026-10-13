// Los datos de la tienda, en memoria: se pierden al parar el servidor. La base de datos llega
// en la Fase 5.
export interface Producto {
  id: number;
  nombre: string;
  precio: number;
}

export type EstadoPedido = 'pendiente' | 'pagado' | 'enviado';

export interface Pedido {
  id: number;
  productoId: number;
  cantidad: number;
  estado: EstadoPedido;
}

export const productos: Producto[] = [
  { id: 1, nombre: 'Camiseta', precio: 20 },
  { id: 2, nombre: 'Taza', precio: 8.5 },
  { id: 3, nombre: 'Sudadera', precio: 35 },
];

export const pedidos: Pedido[] = [];

export function buscarProducto(id: number): Producto | undefined {
  return productos.find((producto) => producto.id === id);
}

// #region crear-producto
export function crearProducto(nombre: string, precio: number): Producto {
  const producto: Producto = { id: productos.length + 1, nombre, precio };
  productos.push(producto);
  return producto;
}
// #endregion crear-producto

export function buscarPedido(id: number): Pedido | undefined {
  return pedidos.find((pedido) => pedido.id === id);
}

export function crearPedido(productoId: number, cantidad: number): Pedido {
  const pedido: Pedido = { id: pedidos.length + 1, productoId, cantidad, estado: 'pendiente' };
  pedidos.push(pedido);
  return pedido;
}
