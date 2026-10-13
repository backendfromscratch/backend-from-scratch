// La API de la Fase 4, lección 2: cada error, con la misma forma en toda la API (Problem Details,
// RFC 9457), para que un cliente los pueda tratar todos igual.
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import {
  borrarProducto,
  buscarPedido,
  buscarProducto,
  crearPedido,
  crearProducto,
  pedidos,
  productos,
} from './datos.ts';
import {
  esquemaCambioPedido,
  esquemaFiltro,
  esquemaId,
  esquemaPedido,
  esquemaProducto,
} from './esquemas.ts';
import { log } from './log.ts';
import { registro } from './middleware/registro.ts';
import { soloAdmin } from './middleware/solo-admin.ts';
import { validar } from './middleware/validar.ts';
import { datosNoValidos, problema, problemaHttp, tipo } from './problemas.ts';

export const app = new Hono();

// requestId da a cada petición un identificador y lo devuelve en la cabecera X-Request-Id.
app.use(requestId());
app.use(registro);
app.use(cors({ origin: 'https://tienda.example' }));

app.get('/', (c) => c.text('Tienda de Ana y Luis. Prueba /productos y /pedidos.\n'));

// #region productos
app.get('/productos', validar('query', esquemaFiltro), (c) => {
  const { max } = c.req.valid('query');
  if (max === undefined) return c.json(productos);
  return c.json(productos.filter((producto) => producto.precio <= max));
});

app.get('/productos/:id', validar('param', esquemaId), (c) => {
  const producto = buscarProducto(c.req.valid('param').id);
  if (!producto) return problemaHttp(c, 404, 'No existe ese producto');
  return c.json(producto);
});

// Crear: POST a la colección. Responde 201 y, en Location, la URL del producto nuevo.
app.post('/productos', soloAdmin, validar('json', esquemaProducto), (c) => {
  const { nombre, precio } = c.req.valid('json');
  const producto = crearProducto(nombre, precio);
  return c.json(producto, 201, { Location: `/productos/${producto.id}` });
});

// Borrar: DELETE al producto. Si sale bien, no hay nada que contar: 204, sin cuerpo.
app.delete('/productos/:id', soloAdmin, validar('param', esquemaId), (c) => {
  if (!borrarProducto(c.req.valid('param').id)) {
    return problemaHttp(c, 404, 'No existe ese producto');
  }
  return c.body(null, 204);
});
// #endregion productos

// #region pedidos
app.get('/pedidos', (c) => c.json(pedidos));

app.get('/pedidos/:id', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  return c.json(pedido);
});

// Un producto que no existe es un dato que no vale: el mismo 422 que la validación, con el campo.
app.post('/pedidos', validar('json', esquemaPedido), (c) => {
  const { productoId, cantidad } = c.req.valid('json');
  if (!buscarProducto(productoId)) {
    return datosNoValidos(c, [{ campo: 'productoId', problema: 'No existe ese producto' }]);
  }
  const pedido = crearPedido(productoId, cantidad);
  return c.json(pedido, 201, { Location: `/pedidos/${pedido.id}` });
});
// #endregion pedidos

// #region conflicto
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
// #endregion conflicto

// #region cambiar-pedido
app.patch(
  '/pedidos/:id',
  validar('param', esquemaId),
  validar('json', esquemaCambioPedido),
  (c) => {
    const pedido = buscarPedido(c.req.valid('param').id);
    if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
    if (pedido.estado !== 'pendiente') {
      return estadoNoLoPermite(c, `El pedido está ${pedido.estado}: ya no se puede cambiar`);
    }
    pedido.cantidad = c.req.valid('json').cantidad;
    return c.json(pedido);
  },
);
// #endregion cambiar-pedido

// #region cancelar
app.post('/pedidos/:id/cancelacion', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  if (pedido.estado === 'enviado') {
    return estadoNoLoPermite(c, 'El pedido ya está enviado: no se puede cancelar');
  }
  pedido.estado = 'cancelado';
  return c.json(pedido);
});
// #endregion cancelar

// #region no-permitido
// Un método que la ruta no tiene: 405, y en Allow, los que sí tiene.
const noPermitido = (c: Context, permitidos: string) =>
  problemaHttp(c, 405, `Esta ruta no admite ${c.req.method}`, { Allow: permitidos });

app.all('/productos', (c) => noPermitido(c, 'GET, POST'));
app.all('/productos/:id', (c) => noPermitido(c, 'GET, DELETE'));
app.all('/pedidos', (c) => noPermitido(c, 'GET, POST'));
app.all('/pedidos/:id', (c) => noPermitido(c, 'GET, PATCH'));
app.all('/pedidos/:id/cancelacion', (c) => noPermitido(c, 'POST'));
// #endregion no-permitido

// #region errores
// Lo que no existe: un 404 con la misma forma que el resto de errores.
app.notFound((c) => problemaHttp(c, 404, 'No existe esa ruta'));

// Cualquier error que se escape de una ruta acaba aquí.
app.onError((error, c) => {
  // Los errores que lanza Hono ya traen su código (un JSON mal formado es un 400).
  if (error instanceof HTTPException) {
    return problemaHttp(c, error.status, 'La petición no se puede leer');
  }
  const id = c.get('requestId');
  // La traza va al log. Al cliente, nada de cómo está hecho el servidor: solo que ha fallado y,
  // en instance, el id de la petición, para buscarla en el log si avisa.
  log.error({ err: error, requestId: id }, 'error sin capturar');
  return problema(c, {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'Algo ha fallado en el servidor. Si se repite, avísanos con el valor de instance.',
    instance: `urn:uuid:${id}`,
  });
});
// #endregion errores
