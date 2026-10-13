import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { crearServidor } from '../src/app.ts';

// El servidor de verdad, en un puerto libre que elige el sistema (el 0).
const servidor = crearServidor();
let base = '';
before(async () => {
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(() => servidor.close());

const pedir = (ruta: string, init?: RequestInit) => fetch(base + ruta, init);
const enviar = (cuerpo: string) =>
  pedir('/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo,
  });

test('GET / responde con texto', async () => {
  const res = await pedir('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.match(await res.text(), /Tienda de Ana y Luis/);
});

test('GET /productos devuelve los tres en JSON', async () => {
  const res = await pedir('/productos');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal((await res.json()).length, 3);
});

test('GET /productos/2 devuelve la taza; /productos/99, un 404', async () => {
  assert.deepEqual(await (await pedir('/productos/2')).json(), {
    id: 2,
    nombre: 'Taza',
    precio: 8.5,
  });
  const res = await pedir('/productos/99');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No existe ese producto' });
});

test('POST /pedidos crea un pedido: 201 con Location', async () => {
  const res = await enviar('{"productoId":1,"cantidad":2}');
  assert.equal(res.status, 201);
  const pedido = await res.json();
  assert.deepEqual(pedido, { id: pedido.id, productoId: 1, cantidad: 2, estado: 'pendiente' });
  assert.equal(res.headers.get('location'), `/pedidos/${pedido.id}`);
  const lista = await (await pedir('/pedidos')).json();
  assert.ok(lista.some((p: { id: number }) => p.id === pedido.id));
});

test('la dirección de Location existe; un pedido que no existe, 404', async () => {
  const pedido = await (await enviar('{"productoId":3,"cantidad":1}')).json();
  assert.deepEqual(await (await pedir(`/pedidos/${pedido.id}`)).json(), pedido);
  const res = await pedir('/pedidos/99');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No existe ese pedido' });
});

test('POST /pedidos con un cuerpo que no es JSON: 400', async () => {
  const res = await enviar('esto no es JSON');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'El cuerpo no es un JSON válido' });
});

test('POST /pedidos con un producto que no existe: 422', async () => {
  assert.equal((await enviar('{"productoId":99,"cantidad":1}')).status, 422);
});

test('un método que la ruta no acepta: 405 con Allow', async () => {
  const res = await pedir('/productos', { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  assert.equal((await pedir('/pedidos', { method: 'PUT' })).headers.get('allow'), 'GET, POST');
});

test('una ruta que no existe: 404', async () => {
  assert.equal((await pedir('/ofertas')).status, 404);
});
