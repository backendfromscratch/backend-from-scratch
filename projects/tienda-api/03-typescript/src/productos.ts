// #region producto
// Los tipos dicen qué forma tiene cada dato. Node los borra al ejecutar: sirven para que el
// editor y tsc avisen de los errores antes de que el programa llegue a ejecutarse.
export interface Producto {
  id: number;
  nombre: string;
  precio: number;
}
// #endregion producto

// #region pedido
// Un pedido solo puede estar en uno de estos tres estados.
export type EstadoPedido = 'pendiente' | 'pagado' | 'enviado';

export interface Pedido {
  id: number;
  productoId: number;
  cantidad: number;
  estado: EstadoPedido;
}
// #endregion pedido

// #region funciones
export const productos: Producto[] = [
  { id: 1, nombre: 'Camiseta', precio: 20 },
  { id: 2, nombre: 'Taza', precio: 8.5 },
  { id: 3, nombre: 'Sudadera', precio: 35 },
];

// Devuelve el producto con ese id, o undefined si no existe: el tipo obliga a contar con ello.
export function buscarProducto(id: number): Producto | undefined {
  return productos.find((producto) => producto.id === id);
}

export function total(producto: Producto, cantidad: number): number {
  return producto.precio * cantidad;
}
// #endregion funciones
