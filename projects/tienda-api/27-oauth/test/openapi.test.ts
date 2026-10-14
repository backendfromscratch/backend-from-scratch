import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { usarBd } from './bd.ts';

usarBd();

const documento = async () => (await app.request('/v2/openapi.json')).json();

test('GET /v2/openapi.json: el contrato, en OpenAPI 3.1, con las rutas bajo /v2', async () => {
  const res = await app.request('/v2/openapi.json');
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.openapi, '3.1.0');
  assert.equal(doc.info.title, 'API de la tienda de Ana y Luis');
  assert.deepEqual(doc.servers, [{ url: '/v2' }]);
});

test('están todas las rutas de v2, cada una con sus métodos', async () => {
  const { paths } = await documento();
  const metodos = Object.fromEntries(
    Object.entries(paths).map(([ruta, operaciones]) => [ruta, Object.keys(operaciones as object)]),
  );
  assert.deepEqual(metodos, {
    '/productos': ['get', 'post'],
    '/productos/{id}': ['get', 'delete'],
    '/pedidos': ['get', 'post'],
    '/pedidos/{id}': ['get', 'patch'],
    '/pedidos/{id}/cancelacion': ['post'],
    '/pedidos/{id}/eventos': ['get'],
    '/webhooks/pagos': ['post'],
    '/cuentas': ['post'],
    '/sesion': ['post', 'delete'],
    '/yo': ['get'],
    '/sesion/proveedor': ['get'],
    '/sesion/proveedor/vuelta': ['get'],
  });
});

test('los esquemas con nombre, y el token como forma de autenticarse', async () => {
  const { components } = await documento();
  assert.deepEqual(Object.keys(components.schemas).sort(), [
    'Acuse',
    'CambioPedido',
    'Credenciales',
    'CuentaNueva',
    'EventoPago',
    'Pedido',
    'PedidoNuevo',
    'Problema',
    'Producto',
    'ProductoNuevo',
    'Usuario',
    'Yo',
  ]);
  assert.deepEqual(components.securitySchemes.Bearer, { type: 'http', scheme: 'bearer' });
  assert.deepEqual(components.securitySchemes.Sesion, {
    type: 'apiKey',
    in: 'cookie',
    name: 'sesion',
  });
});

test('las reglas de validación salen en la documentación: son los mismos esquemas', async () => {
  const { components } = await documento();
  const cantidad = components.schemas.PedidoNuevo.properties.cantidad;
  assert.equal(cantidad.type, 'integer');
  assert.equal(cantidad.minimum, 1);
  assert.equal(cantidad.maximum, 10);
  assert.deepEqual(components.schemas.PedidoNuevo.required, ['productoId', 'cantidad']);
});

test('cada ruta dice qué responde, también sus errores como Problem Details', async () => {
  const { paths } = await documento();
  const crear = paths['/productos'].post;
  assert.deepEqual(crear.security, [{ Bearer: [] }]);
  assert.deepEqual(Object.keys(crear.responses), ['201', '401', '422']);
  assert.ok(crear.responses['201'].headers.Location);
  assert.deepEqual(crear.responses['422'].content['application/problem+json'].schema, {
    $ref: '#/components/schemas/Problema',
  });
  const cancelar = paths['/pedidos/{id}/cancelacion'].post;
  assert.deepEqual(Object.keys(cancelar.responses), ['200', '404', '409', '422']);
  // Una firma que no vale es un 400: un 401 exigiría WWW-Authenticate, y una firma no lo tiene.
  assert.deepEqual(Object.keys(paths['/webhooks/pagos'].post.responses), ['200', '400', '422']);
});

test('el id de la ruta: un entero obligatorio', async () => {
  const { paths } = await documento();
  const [id] = paths['/pedidos/{id}'].get.parameters;
  assert.equal(id.name, 'id');
  assert.equal(id.in, 'path');
  assert.equal(id.required, true);
  assert.equal(id.schema.type, 'integer');
});

test('GET /docs: la página que enseña el contrato, con Scalar en una versión fija', async () => {
  const res = await app.request('/docs');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  const html = await res.text();
  assert.match(html, /\/v2\/openapi\.json/);
  assert.match(html, /@scalar\/api-reference@\d+\.\d+\.\d+/);
});

test('la validación del contrato responde el mismo 422 de siempre', async () => {
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"productoId":1,"cantidad":11}',
  });
  assert.equal(res.status, 422);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual((await res.json()).errores, [
    { campo: 'cantidad', problema: 'Como máximo, 10 por pedido' },
  ]);
});

test('un cuerpo que no es JSON, ni lo dice: 415', async () => {
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{"productoId":1,"cantidad":1}',
  });
  assert.equal(res.status, 415);
  assert.equal((await res.json()).title, 'Unsupported Media Type');
});

test('v1 no está en el contrato: /v1/openapi.json no existe', async () => {
  assert.equal((await app.request('/v1/openapi.json')).status, 404);
});
