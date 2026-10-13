// La API de la Fase 4, lección 1: los recursos (productos y pedidos) y lo que se puede hacer con
// cada uno, con el método y el código de estado que tocan. Sin las rutas de prueba de la Fase 3:
// una API pública no las tendría.
import { Hono } from 'hono';
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
  if (!producto) return c.json({ error: 'No existe ese producto' }, 404);
  return c.json(producto);
});

// Crear: POST a la colección. Responde 201 y, en Location, la URL del producto nuevo.
app.post('/productos', soloAdmin, validar('json', esquemaProducto), (c) => {
  const { nombre, precio } = c.req.valid('json');
  const producto = crearProducto(nombre, precio);
  return c.json(producto, 201, { Location: `/productos/${producto.id}` });
});
// #endregion productos

// #region borrar
// Borrar: DELETE al producto. Si sale bien, no hay nada que contar: 204, sin cuerpo.
app.delete('/productos/:id', soloAdmin, validar('param', esquemaId), (c) => {
  if (!borrarProducto(c.req.valid('param').id)) {
    return c.json({ error: 'No existe ese producto' }, 404);
  }
  return c.body(null, 204);
});
// #endregion borrar

// #region pedidos
app.get('/pedidos', (c) => c.json(pedidos));

app.get('/pedidos/:id', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return c.json({ error: 'No existe ese pedido' }, 404);
  return c.json(pedido);
});

// Cuando la ruta se ejecuta, los datos ya cumplen el esquema: c.req.valid('json') tiene su tipo.
app.post('/pedidos', validar('json', esquemaPedido), (c) => {
  const { productoId, cantidad } = c.req.valid('json');
  // Cumple el esquema, pero pide un producto que no existe: 422, como un dato que no vale.
  if (!buscarProducto(productoId)) return c.json({ error: 'No existe ese producto' }, 422);
  const pedido = crearPedido(productoId, cantidad);
  return c.json(pedido, 201, { Location: `/pedidos/${pedido.id}` });
});
// #endregion pedidos

// #region cambiar-pedido
// Cambiar una parte: PATCH al pedido, con solo lo que cambia. Si el pedido ya está pagado, la
// petición está bien escrita, pero choca con el estado del recurso: 409 Conflict.
app.patch(
  '/pedidos/:id',
  validar('param', esquemaId),
  validar('json', esquemaCambioPedido),
  (c) => {
    const pedido = buscarPedido(c.req.valid('param').id);
    if (!pedido) return c.json({ error: 'No existe ese pedido' }, 404);
    if (pedido.estado !== 'pendiente') {
      return c.json({ error: `El pedido está ${pedido.estado}: ya no se puede cambiar` }, 409);
    }
    pedido.cantidad = c.req.valid('json').cantidad;
    return c.json(pedido);
  },
);
// #endregion cambiar-pedido

// #region cancelar
// Una acción que no es crear, leer, cambiar ni borrar: se convierte en un recurso, «la cancelación
// del pedido», y se crea con POST. Cancelar dos veces deja el pedido igual: cancelado.
app.post('/pedidos/:id/cancelacion', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return c.json({ error: 'No existe ese pedido' }, 404);
  if (pedido.estado === 'enviado') {
    return c.json({ error: 'El pedido ya está enviado: no se puede cancelar' }, 409);
  }
  pedido.estado = 'cancelado';
  return c.json(pedido);
});
// #endregion cancelar

// #region no-permitido
// Un método que la ruta no tiene: 405, y en Allow, los que sí tiene.
const noPermitido = { error: 'Método no permitido' };
app.all('/productos', (c) => c.json(noPermitido, 405, { Allow: 'GET, POST' }));
app.all('/productos/:id', (c) => c.json(noPermitido, 405, { Allow: 'GET, DELETE' }));
app.all('/pedidos', (c) => c.json(noPermitido, 405, { Allow: 'GET, POST' }));
app.all('/pedidos/:id', (c) => c.json(noPermitido, 405, { Allow: 'GET, PATCH' }));
app.all('/pedidos/:id/cancelacion', (c) => c.json(noPermitido, 405, { Allow: 'POST' }));
// #endregion no-permitido

// #region errores
// Lo que no existe: un 404 en JSON, como el resto de la API.
app.notFound((c) => c.json({ error: 'No existe esa ruta' }, 404));

// Cualquier error que se escape de una ruta acaba aquí.
app.onError((error, c) => {
  // Los errores que lanza Hono ya traen su código (un JSON mal formado es un 400): se responden
  // en JSON, como el resto de la API.
  if (error instanceof HTTPException) {
    return c.json({ error: 'La petición no se puede leer', detalle: error.message }, error.status);
  }
  const id = c.get('requestId');
  // El detalle, con la traza, va al log; al cliente, solo un mensaje y el id para buscarlo.
  log.error({ err: error, requestId: id }, 'error sin capturar');
  return c.json({ error: 'Error interno del servidor', requestId: id }, 500);
});
// #endregion errores
