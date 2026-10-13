// La versión 2 de la API: los precios, en céntimos enteros (precioCentimos). Es la versión
// actual; la 1 (v1.ts) solo traduce lo que cambió.
import { type Context, Hono } from 'hono';
import {
  borrarProducto,
  buscarPedido,
  buscarProducto,
  crearPedido,
  crearProducto,
  pedidosMasNuevosPrimero,
  productos,
} from './datos.ts';
import {
  esquemaCambioPedido,
  esquemaFiltro,
  esquemaId,
  esquemaListaPedidos,
  esquemaPedido,
  esquemaProducto,
} from './esquemas.ts';
import { soloAdmin } from './middleware/solo-admin.ts';
import { validar } from './middleware/validar.ts';
import { enlaceSiguiente, paginaPorCursor, paginaPorDesplazamiento } from './paginacion.ts';
import { datosNoValidos, problema, problemaHttp, tipo } from './problemas.ts';

// #region listar-productos
export const v2 = new Hono();

v2.get('/productos', validar('query', esquemaFiltro), (c) => {
  const { maxCentimos, orden } = c.req.valid('query');
  let lista = productos;
  if (maxCentimos !== undefined) {
    lista = lista.filter((producto) => producto.precioCentimos <= maxCentimos);
  }
  // toSorted ordena una copia: el orden de la lista original no cambia.
  if (orden === 'precio') lista = lista.toSorted((a, b) => a.precioCentimos - b.precioCentimos);
  if (orden === '-precio') lista = lista.toSorted((a, b) => b.precioCentimos - a.precioCentimos);
  return c.json(lista);
});
// #endregion listar-productos

v2.get('/productos/:id', validar('param', esquemaId), (c) => {
  const producto = buscarProducto(c.req.valid('param').id);
  if (!producto) return problemaHttp(c, 404, 'No existe ese producto');
  return c.json(producto);
});

// #region crear-producto
// Crear: POST a la colección. Location se arma con la ruta de la petición (/v2/productos), así
// sirve igual en cualquier versión.
v2.post('/productos', soloAdmin, validar('json', esquemaProducto), (c) => {
  const { nombre, precioCentimos } = c.req.valid('json');
  const producto = crearProducto(nombre, precioCentimos);
  return c.json(producto, 201, { Location: `${c.req.path}/${producto.id}` });
});
// #endregion crear-producto

// Borrar: DELETE al producto. Si sale bien, no hay nada que contar: 204, sin cuerpo.
v2.delete('/productos/:id', soloAdmin, validar('param', esquemaId), (c) => {
  if (!borrarProducto(c.req.valid('param').id)) {
    return problemaHttp(c, 404, 'No existe ese producto');
  }
  return c.body(null, 204);
});

// Una página de pedidos, del más nuevo al más antiguo. Si hay más, la cabecera Link dice dónde
// está la siguiente. ?desplazamiento= se queda para comparar las dos formas de paginar.
v2.get('/pedidos', validar('query', esquemaListaPedidos), (c) => {
  const { limite, cursor, desplazamiento, estado } = c.req.valid('query');
  let lista = pedidosMasNuevosPrimero();
  if (estado !== undefined) lista = lista.filter((pedido) => pedido.estado === estado);

  if (desplazamiento !== undefined) {
    const { pagina, siguiente } = paginaPorDesplazamiento(lista, limite, desplazamiento);
    if (siguiente !== undefined) {
      c.header('Link', enlaceSiguiente(c.req.url, 'desplazamiento', String(siguiente)));
    }
    return c.json(pagina);
  }

  const { pagina, siguiente } = paginaPorCursor(lista, limite, cursor);
  if (siguiente !== undefined) c.header('Link', enlaceSiguiente(c.req.url, 'cursor', siguiente));
  return c.json(pagina);
});

v2.get('/pedidos/:id', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  return c.json(pedido);
});

// Un producto que no existe es un dato que no vale: el mismo 422 que la validación, con el campo.
v2.post('/pedidos', validar('json', esquemaPedido), (c) => {
  const { productoId, cantidad } = c.req.valid('json');
  if (!buscarProducto(productoId)) {
    return datosNoValidos(c, [{ campo: 'productoId', problema: 'No existe ese producto' }]);
  }
  const pedido = crearPedido(productoId, cantidad);
  return c.json(pedido, 201, { Location: `${c.req.path}/${pedido.id}` });
});

// Un tipo propio de la tienda: la petición está bien escrita, pero el estado del pedido no deja
// hacerla. title es siempre el mismo; detail dice qué pasa con este pedido.
function estadoNoLoPermite(c: Context, detail: string) {
  return problema(c, {
    type: tipo('estado-del-pedido'),
    title: 'El estado del pedido no lo permite',
    status: 409,
    detail,
  });
}

v2.patch('/pedidos/:id', validar('param', esquemaId), validar('json', esquemaCambioPedido), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  if (pedido.estado !== 'pendiente') {
    return estadoNoLoPermite(c, `El pedido está ${pedido.estado}: ya no se puede cambiar`);
  }
  pedido.cantidad = c.req.valid('json').cantidad;
  return c.json(pedido);
});

v2.post('/pedidos/:id/cancelacion', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  if (pedido.estado === 'enviado') {
    return estadoNoLoPermite(c, 'El pedido ya está enviado: no se puede cancelar');
  }
  pedido.estado = 'cancelado';
  return c.json(pedido);
});

// Un método que la ruta no tiene: 405, y en Allow, los que sí tiene.
const noPermitido = (c: Context, permitidos: string) =>
  problemaHttp(c, 405, `Esta ruta no admite ${c.req.method}`, { Allow: permitidos });

v2.all('/productos', (c) => noPermitido(c, 'GET, POST'));
v2.all('/productos/:id', (c) => noPermitido(c, 'GET, DELETE'));
v2.all('/pedidos', (c) => noPermitido(c, 'GET, POST'));
v2.all('/pedidos/:id', (c) => noPermitido(c, 'GET, PATCH'));
v2.all('/pedidos/:id/cancelacion', (c) => noPermitido(c, 'POST'));
