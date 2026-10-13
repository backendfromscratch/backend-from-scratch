// #region buscar
import { buscarProducto, total, type Pedido } from './productos.ts';

const pedido: Pedido = { id: 1, productoId: 2, cantidad: 3, estado: 'pendiente' };
const producto = buscarProducto(pedido.productoId);

if (producto === undefined) {
  console.log(`No existe el producto ${pedido.productoId}`);
} else {
  console.log(
    `Pedido ${pedido.id}: ${pedido.cantidad} × ${producto.nombre} = ${total(producto, pedido.cantidad)} €`,
  );
}
// #endregion buscar

// #region de-fuera
// Lo que llega de fuera (un JSON, una petición) es unknown: hay que comprobarlo antes de usarlo.
const datos: unknown = JSON.parse('{"id":4,"nombre":"Gorra","precio":15}');
if (typeof datos === 'object' && datos !== null && 'nombre' in datos) {
  console.log(`Ha llegado un producto: ${String(datos.nombre)}`);
}
// #endregion de-fuera
