// La versión 1 de la API, la de antes: los precios, en euros con decimales (precio). Sigue
// funcionando para los clientes que aún la usan, pero está obsoleta y tiene fecha de retirada.
// No guarda nada suyo: lee y escribe los mismos datos que la 2 y solo traduce lo que cambió.
import { Hono } from 'hono';
import { z } from 'zod';
import { buscarProducto, crearProducto, listarProductos, type Producto } from './datos.ts';
import { esquemaFiltro, esquemaId, esquemaNombre } from './esquemas.ts';
import type { Entorno } from './entorno.ts';
import { validar } from './middleware/validar.ts';
import { exigir } from './permisos.ts';
import { problemaHttp } from './problemas.ts';
import { v2 } from './v2.ts';

export const v1 = new Hono<Entorno>();

// #region avisos
// Desde cuándo está obsoleta (RFC 9745: los segundos desde 1970, con una @ delante) y cuándo
// dejará de funcionar (RFC 8594: una fecha HTTP, como la de Expires).
const OBSOLETA_DESDE = new Date('2026-10-13T00:00:00Z');
export const RETIRADA = new Date('2027-04-13T00:00:00Z');

// Cada respuesta de v1 lo avisa en sus cabeceras, y dice dónde está lo mismo en la versión 2.
v1.use(async (c, next) => {
  await next();
  c.header('Deprecation', `@${OBSOLETA_DESDE.getTime() / 1000}`);
  c.header('Sunset', RETIRADA.toUTCString());
  const sucesora = c.req.path.replace(/^\/v1/, '/v2');
  // append: la respuesta puede traer ya un Link (la página siguiente) y no hay que borrarlo.
  c.header('Link', `<${sucesora}>; rel="successor-version"`, { append: true });
});
// #endregion avisos

// #region traducir
// Un producto como lo daba la versión 1: el precio, en euros.
function productoV1(producto: Producto) {
  return { id: producto.id, nombre: producto.nombre, precio: producto.precioCentimos / 100 };
}

// Los esquemas de la versión 1, con el precio en euros.
const esquemaProductoV1 = z.object({
  nombre: esquemaNombre,
  precio: z
    .number({ error: 'Tiene que ser un número' })
    .positive('Tiene que ser mayor que 0')
    .max(10_000, 'Como máximo, 10 000 €'),
});

const esquemaFiltroV1 = z.object({
  max: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .positive('Tiene que ser mayor que 0')
    .optional(),
  orden: esquemaFiltro.shape.orden,
});
// #endregion traducir

// #region leer-v1
// Solo las rutas que cambiaron: las que llevan precio.
v1.get('/productos', validar('query', esquemaFiltroV1), async (c) => {
  const { max, orden } = c.req.valid('query');
  let lista = (await listarProductos()).map(productoV1);
  if (max !== undefined) lista = lista.filter((producto) => producto.precio <= max);
  if (orden === 'precio') lista = lista.toSorted((a, b) => a.precio - b.precio);
  if (orden === '-precio') lista = lista.toSorted((a, b) => b.precio - a.precio);
  return c.json(lista);
});

v1.get('/productos/:id', validar('param', esquemaId), async (c) => {
  const producto = await buscarProducto(c.req.valid('param').id);
  if (!producto) return problemaHttp(c, 404, 'No existe ese producto');
  return c.json(productoV1(producto));
});
// #endregion leer-v1

// #region crear-v1
// Las mismas protecciones que la versión 2: también aquí, crear productos es cosa de admin.
v1.post(
  '/productos',
  exigir('productos:gestionar'),
  validar('json', esquemaProductoV1),
  async (c) => {
    const { nombre, precio } = c.req.valid('json');
    // De euros a céntimos. Math.round, porque 8.29 * 100 es 828.9999999999999.
    const producto = await crearProducto(nombre, Math.round(precio * 100));
    return c.json(productoV1(producto), 201, { Location: `${c.req.path}/${producto.id}` });
  },
);

// Todo lo demás (los pedidos, borrar un producto) no ha cambiado: lo atienden las rutas de la 2.
v1.route('/', v2);
// #endregion crear-v1
