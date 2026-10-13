import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';

// app.request() le pasa una petición a Hono sin abrir ningún puerto.
const enviar = (cuerpo: string) =>
  app.request('/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo,
  });

test('GET / responde con texto', async () => {
  const res = await app.request('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Tienda de Ana y Luis/);
});

test('GET /productos devuelve los tres; con ?max=25, dos', async () => {
  assert.equal((await (await app.request('/productos')).json()).length, 3);
  const baratos = await (await app.request('/productos?max=25')).json();
  assert.deepEqual(
    baratos.map((p: { nombre: string }) => p.nombre),
    ['Camiseta', 'Taza'],
  );
});

test('GET /productos/2 devuelve la taza; /productos/99, un 404', async () => {
  assert.equal((await (await app.request('/productos/2')).json()).nombre, 'Taza');
  assert.equal((await app.request('/productos/99')).status, 404);
});

test('POST /pedidos crea un pedido: 201 con Location', async () => {
  const res = await enviar('{"productoId":1,"cantidad":2}');
  assert.equal(res.status, 201);
  const pedido = await res.json();
  assert.equal(res.headers.get('location'), `/pedidos/${pedido.id}`);
});

test('la dirección de Location existe; un pedido que no existe, 404', async () => {
  const pedido = await (await enviar('{"productoId":3,"cantidad":1}')).json();
  assert.deepEqual(await (await app.request(`/pedidos/${pedido.id}`)).json(), pedido);
  assert.equal((await app.request('/pedidos/99')).status, 404);
});

test('POST /pedidos con un cuerpo que no es JSON: 400', async () => {
  assert.equal((await enviar('esto no es JSON')).status, 400);
});

test('POST /pedidos con un producto que no existe: 422', async () => {
  assert.equal((await enviar('{"productoId":99,"cantidad":1}')).status, 422);
});

test('un método que la ruta no acepta: 405 con Allow', async () => {
  const res = await app.request('/productos', { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  assert.equal(
    (await app.request('/pedidos', { method: 'PUT' })).headers.get('allow'),
    'GET, POST',
  );
});

test('una ruta que no existe: 404', async () => {
  assert.equal((await app.request('/ofertas')).status, 404);
});
