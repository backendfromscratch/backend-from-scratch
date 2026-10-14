import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { usarBd } from './bd.ts';

usarBd();

const admin = { Authorization: `Bearer ${config.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };

test('la raíz dice qué versiones hay y cuándo se retira la 1', async () => {
  assert.deepEqual(await (await app.request('/')).json(), {
    nombre: 'API de la tienda de Ana y Luis',
    versiones: [
      { version: 'v2', url: '/v2', estado: 'actual' },
      { version: 'v1', url: '/v1', estado: 'obsoleta', retirada: '2027-04-13T00:00:00.000Z' },
    ],
  });
});

test('v2: el precio, en céntimos enteros', async () => {
  assert.deepEqual(await (await app.request('/v2/productos/2')).json(), {
    id: 2,
    nombre: 'Taza',
    precioCentimos: 850,
    stock: 60,
    categorias: ['Hogar', 'Regalos'],
  });
});

test('v1 sigue igual que antes: el precio, en euros', async () => {
  assert.deepEqual(await (await app.request('/v1/productos/2')).json(), {
    id: 2,
    nombre: 'Taza',
    precio: 8.5,
  });
  const baratos = await (await app.request('/v1/productos?max=10&orden=-precio')).json();
  assert.deepEqual(baratos, [{ id: 2, nombre: 'Taza', precio: 8.5 }]);
});

test('v1 avisa de que está obsoleta, de cuándo se retira y de dónde está la 2', async () => {
  const res = await app.request('/v1/productos/2');
  assert.equal(res.headers.get('deprecation'), '@1791849600');
  assert.equal(res.headers.get('sunset'), 'Tue, 13 Apr 2027 00:00:00 GMT');
  assert.equal(res.headers.get('link'), '</v2/productos/2>; rel="successor-version"');
});

test('v2 no lleva esos avisos', async () => {
  const res = await app.request('/v2/productos/2');
  assert.equal(res.headers.get('deprecation'), null);
  assert.equal(res.headers.get('sunset'), null);
});

test('un producto creado con v1, en euros, se lee en v2 en céntimos', async () => {
  const res = await app.request('/v1/productos', {
    method: 'POST',
    headers: admin,
    body: '{"nombre":"Gorra","precio":8.29}',
  });
  assert.equal(res.status, 201);
  const creado = await res.json();
  assert.equal(creado.precio, 8.29);
  assert.equal(res.headers.get('location'), `/v1/productos/${creado.id}`);
  const enV2 = await (await app.request(`/v2/productos/${creado.id}`)).json();
  assert.equal(enV2.precioCentimos, 829);
});

test('en v2, el precio en euros ya no vale: es un cambio que rompe', async () => {
  const res = await app.request('/v2/productos', {
    method: 'POST',
    headers: admin,
    body: '{"nombre":"Gorra","precio":15}',
  });
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errores, [
    { campo: 'precioCentimos', problema: 'Tiene que ser un número' },
  ]);
});

test('los pedidos de v1 son los de v2, con los avisos y sin perder el Link de la página siguiente', async () => {
  const res = await app.request('/v1/pedidos?limite=2');
  assert.equal(res.status, 200);
  assert.deepEqual(
    (await res.json()).map((pedido: { id: number }) => pedido.id),
    [25, 24],
  );
  assert.equal(res.headers.get('deprecation'), '@1791849600');
  const link = res.headers.get('link') ?? '';
  assert.match(
    link,
    /<http:\/\/localhost\/v1\/pedidos\?limite=2&cursor=WyIyMDI2LTEwLTA4VDAyOjAwOjAwLjAwMFoiLDI0XQ>; rel="next"/,
  );
  assert.match(link, /<\/v2\/pedidos>; rel="successor-version"/);
});

test('sin versión, las rutas ya no existen: 404', async () => {
  assert.equal((await app.request('/productos')).status, 404);
});
