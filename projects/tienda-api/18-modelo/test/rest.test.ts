import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { buscarPedido } from '../src/datos.ts';

const admin = { Authorization: `Bearer ${config.ADMIN_TOKEN}` };

const pedir = (metodo: string, ruta: string, cuerpo?: unknown, cabeceras = {}) =>
  app.request(ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

/** Crea un pedido y devuelve su id. */
async function pedidoNuevo(): Promise<number> {
  const res = await pedir('POST', '/v2/pedidos', { productoId: 1, cantidad: 2 });
  return (await res.json()).id;
}

test('crear un pedido: 201, con su URL en Location, y aparece en la lista', async () => {
  const res = await pedir('POST', '/v2/pedidos', { productoId: 1, cantidad: 2 });
  assert.equal(res.status, 201);
  const pedido = await res.json();
  assert.equal(res.headers.get('location'), `/v2/pedidos/${pedido.id}`);
  assert.equal(pedido.estado, 'pendiente');
  const lista = await (await app.request('/v2/pedidos')).json();
  assert.ok(lista.some((otro: { id: number }) => otro.id === pedido.id));
});

test('DELETE /productos/:id sin token: 401', async () => {
  assert.equal((await pedir('DELETE', '/v2/productos/1')).status, 401);
});

test('DELETE /productos/:id: 204 sin cuerpo; después, 404', async () => {
  const creado = await (
    await pedir('POST', '/v2/productos', { nombre: 'Gorra', precioCentimos: 1500 }, admin)
  ).json();
  const res = await pedir('DELETE', `/v2/productos/${creado.id}`, undefined, admin);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
  assert.equal((await app.request(`/v2/productos/${creado.id}`)).status, 404);
  assert.equal((await pedir('DELETE', `/v2/productos/${creado.id}`, undefined, admin)).status, 404);
});

test('después de borrar, un producto nuevo no repite el id de otro', async () => {
  await pedir('DELETE', '/v2/productos/2', undefined, admin);
  const nuevo = await (
    await pedir('POST', '/v2/productos', { nombre: 'Gorro', precioCentimos: 1200 }, admin)
  ).json();
  const lista = await (await app.request('/v2/productos')).json();
  const ids = lista.map((producto: { id: number }) => producto.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.slice(0, -1).includes(nuevo.id));
});

test('PATCH /pedidos/:id cambia la cantidad y devuelve el pedido entero', async () => {
  const id = await pedidoNuevo();
  const res = await pedir('PATCH', `/v2/pedidos/${id}`, { cantidad: 5 });
  assert.equal(res.status, 200);
  const { creadoEn, ...pedido } = await res.json();
  assert.deepEqual(pedido, { id, productoId: 1, cantidad: 5, estado: 'pendiente' });
  assert.equal(typeof creadoEn, 'string');
});

test('PATCH con una cantidad que no vale: 422; a un pedido que no existe: 404', async () => {
  const id = await pedidoNuevo();
  assert.equal((await pedir('PATCH', `/v2/pedidos/${id}`, { cantidad: 0 })).status, 422);
  assert.equal((await pedir('PATCH', '/v2/pedidos/999', { cantidad: 1 })).status, 404);
});

test('PATCH a un pedido ya pagado: 409, y el pedido no cambia', async () => {
  const id = await pedidoNuevo();
  buscarPedido(id)!.estado = 'pagado';
  const res = await pedir('PATCH', `/v2/pedidos/${id}`, { cantidad: 5 });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).detail, 'El pedido está pagado: ya no se puede cambiar');
  assert.equal(buscarPedido(id)!.cantidad, 2);
});

test('POST /pedidos/:id/cancelacion: el pedido queda cancelado, aunque se repita', async () => {
  const id = await pedidoNuevo();
  for (let vez = 1; vez <= 2; vez++) {
    const res = await pedir('POST', `/v2/pedidos/${id}/cancelacion`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).estado, 'cancelado');
  }
  assert.equal((await pedir('PATCH', `/v2/pedidos/${id}`, { cantidad: 3 })).status, 409);
});

test('cancelar un pedido enviado: 409; uno que no existe: 404', async () => {
  const id = await pedidoNuevo();
  buscarPedido(id)!.estado = 'enviado';
  const res = await pedir('POST', `/v2/pedidos/${id}/cancelacion`);
  assert.equal(res.status, 409);
  assert.equal(buscarPedido(id)!.estado, 'enviado');
  assert.equal((await pedir('POST', '/v2/pedidos/999/cancelacion')).status, 404);
});

test('un método que la ruta no tiene: 405, con los que sí tiene en Allow', async () => {
  const casos = [
    ['PUT', '/v2/productos/1', 'GET, DELETE'],
    ['DELETE', '/v2/pedidos', 'GET, POST'],
    ['DELETE', '/v2/pedidos/1', 'GET, PATCH'],
    ['GET', '/v2/pedidos/1/cancelacion', 'POST'],
  ];
  for (const [metodo, ruta, permitidos] of casos) {
    const res = await pedir(metodo!, ruta!);
    assert.equal(res.status, 405, `${metodo} ${ruta}`);
    assert.equal(res.headers.get('allow'), permitidos);
  }
});
