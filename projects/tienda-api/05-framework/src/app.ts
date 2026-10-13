// La misma API que en la lección 4, ahora con Hono.
// #region crear-app
import { Hono } from 'hono';
import { buscarPedido, buscarProducto, crearPedido, pedidos, productos } from './datos.ts';

export const app = new Hono();
// #endregion crear-app

// #region rutas
app.get('/', (c) => c.text('Tienda de Ana y Luis. Prueba /productos y /pedidos.\n'));

// ?max=25: solo los productos que cuestan como mucho eso.
app.get('/productos', (c) => {
  const max = c.req.query('max');
  if (max === undefined) return c.json(productos);
  return c.json(productos.filter((producto) => producto.precio <= Number(max)));
});

// :id es un parámetro de la ruta: /productos/2 lo deja en c.req.param('id').
app.get('/productos/:id', (c) => {
  const producto = buscarProducto(Number(c.req.param('id')));
  if (!producto) return c.json({ error: 'No existe ese producto' }, 404);
  return c.json(producto);
});

app.get('/pedidos', (c) => c.json(pedidos));

app.get('/pedidos/:id', (c) => {
  const pedido = buscarPedido(Number(c.req.param('id')));
  if (!pedido) return c.json({ error: 'No existe ese pedido' }, 404);
  return c.json(pedido);
});
// #endregion rutas

// #region nuevo-pedido
app.post('/pedidos', async (c) => {
  let datos: { productoId: number; cantidad: number };
  try {
    datos = await c.req.json();
  } catch {
    return c.json({ error: 'El cuerpo no es un JSON válido' }, 400);
  }
  if (!buscarProducto(datos.productoId)) {
    return c.json({ error: 'No existe ese producto' }, 422);
  }
  const pedido = crearPedido(datos.productoId, datos.cantidad);
  return c.json(pedido, 201, { Location: `/pedidos/${pedido.id}` });
});
// #endregion nuevo-pedido

// #region no-permitido
// Hono responde 404 a un método que una ruta no tiene. Para responder 405 con Allow, como en la
// lección 4, se añade una ruta para el resto de métodos, después de las otras.
app.all('/productos', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET' }));
app.all('/productos/:id', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET' }));
app.all('/pedidos', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET, POST' }));
app.all('/pedidos/:id', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET' }));
// #endregion no-permitido
