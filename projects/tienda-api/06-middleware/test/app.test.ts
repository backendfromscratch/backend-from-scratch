import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { TOKEN_ADMIN } from '../src/config.ts';

// El registro escribe con console.log: aquí se recoge en vez de escribirse.
const lineas = mock.method(console, 'log', () => {});
beforeEach(() => lineas.mock.resetCalls());

const json = { 'Content-Type': 'application/json' };

test('el registro anota método, ruta, código y tiempo', async () => {
  await app.request('/productos/99');
  assert.match(String(lineas.mock.calls[0]?.arguments[0]), /^GET \/productos\/99 404 \d+ ms$/);
});

test('CORS: la respuesta deja leerla a https://tienda.example', async () => {
  const res = await app.request('/productos', { headers: { Origin: 'https://tienda.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://tienda.example');
});

test('CORS: responde al preflight con 204 y los métodos permitidos', async () => {
  const res = await app.request('/pedidos', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://tienda.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
});

test('POST /productos sin token: 401 con WWW-Authenticate', async () => {
  const res = await app.request('/productos', {
    method: 'POST',
    headers: json,
    body: '{"nombre":"Gorra","precio":15}',
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
});

test('POST /productos con el token: 201, y el producto aparece en la lista', async () => {
  const res = await app.request('/productos', {
    method: 'POST',
    headers: { ...json, Authorization: `Bearer ${TOKEN_ADMIN}` },
    body: '{"nombre":"Gorra","precio":15}',
  });
  assert.equal(res.status, 201);
  const producto = await res.json();
  assert.equal(res.headers.get('location'), `/productos/${producto.id}`);
  assert.equal((await (await app.request(`/productos/${producto.id}`)).json()).nombre, 'Gorra');
});

test('las rutas de la lección 5 siguen igual', async () => {
  assert.equal((await (await app.request('/productos?max=10')).json()).length, 1);
  const res = await app.request('/pedidos', {
    method: 'POST',
    headers: json,
    body: '{"productoId":1,"cantidad":2}',
  });
  assert.equal(res.status, 201);
  assert.equal(
    (await app.request('/productos', { method: 'DELETE' })).headers.get('allow'),
    'GET, POST',
  );
});
