import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { buscarPedido } from '../src/datos.ts';

const enviar = (metodo: string, ruta: string, cuerpo: string) =>
  app.request(ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo,
  });

/** Comprueba que la respuesta es un Problem Details y devuelve su cuerpo. */
async function leerProblema(res: Response, status: number) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  const cuerpo = await res.json();
  assert.equal(cuerpo.status, status, 'el cuerpo repite el código de estado');
  assert.equal(typeof cuerpo.type, 'string');
  assert.equal(typeof cuerpo.title, 'string');
  return cuerpo;
}

test('una ruta que no existe: 404, about:blank, con la frase del código de título', async () => {
  assert.deepEqual(await leerProblema(await app.request('/ofertas'), 404), {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'No existe esa ruta',
  });
});

test('un producto o un pedido que no existe: 404 con su detail', async () => {
  const producto = await leerProblema(await app.request('/productos/99'), 404);
  assert.equal(producto.detail, 'No existe ese producto');
  const pedido = await leerProblema(await app.request('/pedidos/99'), 404);
  assert.equal(pedido.detail, 'No existe ese pedido');
});

test('datos que no valen: 422, con un error por campo en «errores»', async () => {
  const res = await enviar('POST', '/pedidos', '{"productoId":"uno","cantidad":0}');
  assert.deepEqual(await leerProblema(res, 422), {
    type: 'https://tienda.example/problemas/datos-no-validos',
    title: 'Los datos no son válidos',
    status: 422,
    detail: 'Mira en «errores» qué falla en cada campo.',
    errores: [
      { campo: 'productoId', problema: 'Tiene que ser un número' },
      { campo: 'cantidad', problema: 'Como mínimo, 1' },
    ],
  });
});

test('un producto que no existe en un pedido: el mismo tipo de problema, con el campo', async () => {
  const cuerpo = await leerProblema(
    await enviar('POST', '/pedidos', '{"productoId":99,"cantidad":1}'),
    422,
  );
  assert.equal(cuerpo.type, 'https://tienda.example/problemas/datos-no-validos');
  assert.deepEqual(cuerpo.errores, [{ campo: 'productoId', problema: 'No existe ese producto' }]);
});

test('la ruta y la query string también responden 422 con «errores»', async () => {
  const id = await leerProblema(await app.request('/productos/abc'), 422);
  assert.deepEqual(id.errores, [{ campo: 'id', problema: 'Tiene que ser un número' }]);
  const max = await leerProblema(await app.request('/productos?max=-5'), 422);
  assert.deepEqual(max.errores, [{ campo: 'max', problema: 'Tiene que ser mayor que 0' }]);
});

test('un cuerpo que no es JSON: 400, también como problema', async () => {
  const cuerpo = await leerProblema(await enviar('POST', '/pedidos', 'esto no es JSON'), 400);
  assert.equal(cuerpo.title, 'Bad Request');
  assert.equal(cuerpo.detail, 'La petición no se puede leer');
});

test('sin token: 401, con WWW-Authenticate', async () => {
  const res = await enviar('POST', '/productos', '{"nombre":"Gorra","precio":15}');
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
  assert.equal((await leerProblema(res, 401)).title, 'Unauthorized');
});

test('un método que no existe: 405 como problema, con Allow', async () => {
  const res = await app.request('/pedidos/1', { method: 'PUT' });
  assert.equal(res.headers.get('allow'), 'GET, PATCH');
  const cuerpo = await leerProblema(res, 405);
  assert.equal(cuerpo.title, 'Method Not Allowed');
  assert.equal(cuerpo.detail, 'Esta ruta no admite PUT');
});

test('un pedido que ya no se puede cambiar: 409, con un tipo propio de la tienda', async () => {
  const { id } = await (await enviar('POST', '/pedidos', '{"productoId":1,"cantidad":1}')).json();
  buscarPedido(id)!.estado = 'enviado';
  assert.deepEqual(
    await leerProblema(await app.request(`/pedidos/${id}/cancelacion`, { method: 'POST' }), 409),
    {
      type: 'https://tienda.example/problemas/estado-del-pedido',
      title: 'El estado del pedido no lo permite',
      status: 409,
      detail: 'El pedido ya está enviado: no se puede cancelar',
    },
  );
});
