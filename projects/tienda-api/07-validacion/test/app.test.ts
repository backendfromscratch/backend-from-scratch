import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { TOKEN_ADMIN } from '../src/config.ts';

mock.method(console, 'log', () => {});

const enviar = (ruta: string, cuerpo: string, cabeceras: Record<string, string> = {}) =>
  app.request(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: cuerpo,
  });

test('un pedido correcto: 201', async () => {
  assert.equal((await enviar('/pedidos', '{"productoId":1,"cantidad":2}')).status, 201);
});

test('un pedido sin cantidad, con un id de texto: 422 con cada problema', async () => {
  const res = await enviar('/pedidos', '{"productoId":"uno"}');
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), {
    error: 'Los datos no son válidos',
    detalles: [
      { campo: 'productoId', problema: 'Tiene que ser un número' },
      { campo: 'cantidad', problema: 'Tiene que ser un número' },
    ],
  });
});

test('una cantidad negativa, o demasiado grande: 422', async () => {
  const negativa = await (await enviar('/pedidos', '{"productoId":1,"cantidad":-2}')).json();
  assert.deepEqual(negativa.detalles, [{ campo: 'cantidad', problema: 'Como mínimo, 1' }]);
  const grande = await (await enviar('/pedidos', '{"productoId":1,"cantidad":50}')).json();
  assert.deepEqual(grande.detalles, [
    { campo: 'cantidad', problema: 'Como máximo, 10 por pedido' },
  ]);
});

test('un producto que no existe pasa el esquema, pero no la comprobación de la ruta: 422', async () => {
  const res = await enviar('/pedidos', '{"productoId":99,"cantidad":1}');
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: 'No existe ese producto' });
});

test('un cuerpo que no es JSON no se puede leer: 400', async () => {
  assert.equal((await enviar('/pedidos', 'esto no es JSON')).status, 400);
});

test('el id de la ruta y la query string también se validan', async () => {
  const id = await app.request('/productos/abc');
  assert.equal(id.status, 422);
  assert.deepEqual((await id.json()).detalles, [
    { campo: 'id', problema: 'Tiene que ser un número' },
  ]);
  assert.equal((await app.request('/productos?max=-5')).status, 422);
  assert.equal((await (await app.request('/productos?max=10')).json()).length, 1);
});

test('un producto nuevo: el nombre se recorta y no puede quedar vacío', async () => {
  const admin = { Authorization: `Bearer ${TOKEN_ADMIN}` };
  const vacio = await enviar('/productos', '{"nombre":"   ","precio":15}', admin);
  assert.deepEqual((await vacio.json()).detalles, [
    { campo: 'nombre', problema: 'No puede estar vacío' },
  ]);
  const bien = await enviar('/productos', '{"nombre":"  Gorra ","precio":15}', admin);
  assert.equal((await bien.json()).nombre, 'Gorra');
});

test('sin token, el 401 llega antes que la validación', async () => {
  assert.equal((await enviar('/productos', '{}')).status, 401);
});
