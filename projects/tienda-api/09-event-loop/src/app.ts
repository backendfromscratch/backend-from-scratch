// La API de la lección 8, con dos rutas lentas para ver el event loop: una que lo bloquea y otra
// que no.
// #region importar-crypto
import { pbkdf2, pbkdf2Sync } from 'node:crypto';
import { promisify } from 'node:util';
// #endregion importar-crypto
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import {
  buscarPedido,
  buscarProducto,
  crearPedido,
  crearProducto,
  pedidos,
  productos,
} from './datos.ts';
import { esquemaFiltro, esquemaId, esquemaPedido, esquemaProducto } from './esquemas.ts';
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

// #region rutas
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

app.post('/productos', soloAdmin, validar('json', esquemaProducto), (c) => {
  const { nombre, precio } = c.req.valid('json');
  const producto = crearProducto(nombre, precio);
  return c.json(producto, 201, { Location: `/productos/${producto.id}` });
});

app.get('/pedidos', (c) => c.json(pedidos));

app.get('/pedidos/:id', validar('param', esquemaId), (c) => {
  const pedido = buscarPedido(c.req.valid('param').id);
  if (!pedido) return c.json({ error: 'No existe ese pedido' }, 404);
  return c.json(pedido);
});

// #region lento
// Un cálculo caro a propósito: lo mismo que hace un servidor al comprobar una contraseña (Fase 6).
const VUELTAS = 3_000_000;
const pbkdf2Asincrono = promisify(pbkdf2);

// Bloquea: mientras calcula, el event loop no puede atender ninguna otra petición.
app.get('/lento', (c) => {
  const inicio = performance.now();
  pbkdf2Sync('contraseña', 'sal', VUELTAS, 64, 'sha512');
  return c.json({ ms: Math.round(performance.now() - inicio) });
});

// No bloquea: el cálculo se hace en otro hilo, y el event loop sigue atendiendo mientras tanto.
app.get('/lento-asincrono', async (c) => {
  const inicio = performance.now();
  await pbkdf2Asincrono('contraseña', 'sal', VUELTAS, 64, 'sha512');
  return c.json({ ms: Math.round(performance.now() - inicio) });
});
// #endregion lento

// Una ruta que falla a propósito, para ver qué pasa con un error que nadie esperaba.
app.get('/error', () => {
  throw new Error('Algo ha fallado a propósito');
});

// Cuando la ruta se ejecuta, los datos ya cumplen el esquema: c.req.valid('json') tiene su tipo.
app.post('/pedidos', validar('json', esquemaPedido), (c) => {
  const { productoId, cantidad } = c.req.valid('json');
  // Cumple el esquema, pero pide un producto que no existe: 422, como un dato que no vale.
  if (!buscarProducto(productoId)) return c.json({ error: 'No existe ese producto' }, 422);
  const pedido = crearPedido(productoId, cantidad);
  return c.json(pedido, 201, { Location: `/pedidos/${pedido.id}` });
});
// #endregion rutas

app.all('/productos', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET, POST' }));
app.all('/productos/:id', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET' }));
app.all('/pedidos', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET, POST' }));
app.all('/pedidos/:id', (c) => c.json({ error: 'Método no permitido' }, 405, { Allow: 'GET' }));

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
