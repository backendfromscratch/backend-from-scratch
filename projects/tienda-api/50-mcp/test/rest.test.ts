import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { buscarPedido, cambiarEstado } from '../src/datos.ts';
import { usarBd } from './bd.ts';
import { ANA, CARMEN, comoUsuario } from './identidades.ts';

// Ana es admin (gestiona productos); Carmen, clienta (hace pedidos). Si no se dice otra cosa, las
// peticiones van con la sesión de Carmen.
let admin: Record<string, string>;
let carmen: Record<string, string>;
usarBd(async () => {
  admin = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
});

const pedir = (metodo: string, ruta: string, cuerpo?: unknown, cabeceras = carmen) =>
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
  const lista = await (await app.request('/v2/pedidos', { headers: carmen })).json();
  assert.ok(lista.some((otro: { id: number }) => otro.id === pedido.id));
});

test('DELETE /productos/:id sin sesión: 401', async () => {
  assert.equal((await pedir('DELETE', '/v2/productos/1', undefined, {})).status, 401);
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

// #region cambiar-producto
test('PATCH /productos/:id: cambia el nombre, el precio o los dos, y devuelve el producto', async () => {
  const precio = await pedir('PATCH', '/v2/productos/2', { precioCentimos: 900 }, admin);
  assert.equal(precio.status, 200);
  assert.deepEqual(await precio.json(), {
    id: 2,
    nombre: 'Taza',
    precioCentimos: 900,
    stock: 60,
    categorias: ['Hogar', 'Regalos'],
  });
  const losDos = await pedir(
    'PATCH',
    '/v2/productos/2',
    { nombre: ' Taza grande ', precioCentimos: 950 },
    admin,
  );
  assert.equal(losDos.status, 200);
  assert.deepEqual(await (await app.request('/v2/productos/2')).json(), {
    id: 2,
    nombre: 'Taza grande',
    precioCentimos: 950,
    stock: 60,
    categorias: ['Hogar', 'Regalos'],
  });
});

test('PATCH /productos/:id: 404 si no existe, 403 sin permiso, 422 sin cambios o con uno que no vale', async () => {
  assert.equal(
    (await pedir('PATCH', '/v2/productos/999', { precioCentimos: 900 }, admin)).status,
    404,
  );
  // Carmen es clienta: no gestiona productos.
  assert.equal((await pedir('PATCH', '/v2/productos/1', { precioCentimos: 1 })).status, 403);
  assert.equal((await pedir('PATCH', '/v2/productos/1', { precioCentimos: 1 }, {})).status, 401);
  const vacio = await pedir('PATCH', '/v2/productos/1', {}, admin);
  assert.equal(vacio.status, 422);
  assert.deepEqual((await vacio.json()).errores, [
    { campo: '', problema: 'Cambia al menos el nombre o el precio' },
  ]);
  const gratis = await pedir('PATCH', '/v2/productos/1', { precioCentimos: 0 }, admin);
  assert.equal(gratis.status, 422);
  assert.deepEqual((await gratis.json()).errores, [
    { campo: 'precioCentimos', problema: 'Tiene que ser mayor que 0' },
  ]);
  // Nada ha cambiado.
  assert.equal((await (await app.request('/v2/productos/1')).json()).precioCentimos, 2000);
});
// #endregion cambiar-producto

test('después de borrar, un producto nuevo no repite el id de otro', async () => {
  // La gorra (4): un producto sin pedidos, que sí se puede borrar.
  assert.equal((await pedir('DELETE', '/v2/productos/4', undefined, admin)).status, 204);
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
  assert.deepEqual(pedido, {
    id,
    productoId: 1,
    cantidad: 5,
    estado: 'pendiente',
    clienteId: 3,
  });
  assert.equal(typeof creadoEn, 'string');
});

test('PATCH con una cantidad que no vale: 422; a un pedido que no existe: 404', async () => {
  const id = await pedidoNuevo();
  assert.equal((await pedir('PATCH', `/v2/pedidos/${id}`, { cantidad: 0 })).status, 422);
  assert.equal((await pedir('PATCH', '/v2/pedidos/999', { cantidad: 1 })).status, 404);
});

test('PATCH a un pedido ya pagado: 409, y el pedido no cambia', async () => {
  const id = await pedidoNuevo();
  await cambiarEstado(id, 'pagado');
  const res = await pedir('PATCH', `/v2/pedidos/${id}`, { cantidad: 5 });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).detail, 'El pedido está pagado: ya no se puede cambiar');
  assert.equal((await buscarPedido(id))!.cantidad, 2);
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
  await cambiarEstado(id, 'enviado');
  const res = await pedir('POST', `/v2/pedidos/${id}/cancelacion`);
  assert.equal(res.status, 409);
  assert.equal((await buscarPedido(id))!.estado, 'enviado');
  assert.equal((await pedir('POST', '/v2/pedidos/999/cancelacion')).status, 404);
});

test('un método que la ruta no tiene: 405, con los que sí tiene en Allow', async () => {
  const casos = [
    ['PUT', '/v2/productos/1', 'GET, DELETE, PATCH'],
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
