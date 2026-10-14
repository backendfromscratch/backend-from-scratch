import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { usarBd } from './bd.ts';
import { ANA, CARMEN, comoReparto, comoUsuario, PABLO } from './identidades.ts';

// Cada una de las identidades de la tienda: nadie, Ana (admin), Carmen y Pablo (clientes) y la
// clave de la empresa de reparto.
const identidades: Record<string, Record<string, string>> = { nadie: {} };
usarBd(async () => {
  identidades.ana = await comoUsuario(ANA);
  identidades.carmen = await comoUsuario(CARMEN);
  identidades.pablo = await comoUsuario(PABLO);
  identidades.reparto = await comoReparto();
});

const pedir = (quien: string, metodo: string, ruta: string, cuerpo?: unknown) =>
  app.request(ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...identidades[quien] },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

/** El código de estado de la misma petición, hecha por cada una de esas identidades. */
async function codigos(quienes: string[], metodo: string, ruta: string, cuerpo?: unknown) {
  const resultado: Record<string, number> = {};
  for (const quien of quienes) resultado[quien] = (await pedir(quien, metodo, ruta, cuerpo)).status;
  return resultado;
}

const ids = async (res: Response) => (await res.json()).map((p: { id: number }) => p.id);

test('la lista de pedidos: sin identidad, 401; un cliente ve los suyos; admin y reparto, todos', async () => {
  const sinNadie = await pedir('nadie', 'GET', '/v2/pedidos?limite=50');
  assert.equal(sinNadie.status, 401);
  assert.equal(sinNadie.headers.get('www-authenticate'), 'Bearer realm="tienda-api"');

  const deCarmen = await (await pedir('carmen', 'GET', '/v2/pedidos?limite=50')).json();
  assert.equal(deCarmen.length, 13);
  assert.ok(deCarmen.every((pedido: { clienteId: number }) => pedido.clienteId === CARMEN));
  assert.deepEqual(await ids(await pedir('pablo', 'GET', '/v2/pedidos?limite=3')), [24, 22, 20]);
  for (const quien of ['ana', 'reparto']) {
    assert.equal((await ids(await pedir(quien, 'GET', '/v2/pedidos?limite=50'))).length, 25);
  }
});

test('un pedido de otro: 404, como si no existiera, también su flujo de eventos', async () => {
  // El 2 es de Pablo.
  assert.deepEqual(
    await codigos(['nadie', 'carmen', 'pablo', 'ana', 'reparto'], 'GET', '/v2/pedidos/2'),
    {
      nadie: 401,
      carmen: 404,
      pablo: 200,
      ana: 200,
      reparto: 200,
    },
  );
  const ajeno = await pedir('carmen', 'GET', '/v2/pedidos/2');
  assert.equal((await ajeno.json()).detail, 'No existe ese pedido');
  assert.equal((await pedir('carmen', 'GET', '/v2/pedidos/2/eventos')).status, 404);
});

test('cambiar o cancelar un pedido de otro: 404; el suyo, sí; admin, cualquiera', async () => {
  // El 22 (pendiente) es de Pablo; el 21 (pendiente), de Carmen.
  assert.equal((await pedir('carmen', 'PATCH', '/v2/pedidos/22', { cantidad: 1 })).status, 404);
  assert.equal((await pedir('carmen', 'POST', '/v2/pedidos/22/cancelacion')).status, 404);
  assert.equal((await pedir('reparto', 'POST', '/v2/pedidos/22/cancelacion')).status, 403);
  assert.equal((await pedir('pablo', 'PATCH', '/v2/pedidos/22', { cantidad: 1 })).status, 200);
  assert.equal((await pedir('ana', 'POST', '/v2/pedidos/21/cancelacion')).status, 200);
  const { rows } = await pool.query(
    'SELECT id, cantidad, estado FROM pedidos WHERE id IN (21, 22) ORDER BY id',
  );
  assert.deepEqual(rows, [
    { id: 21, cantidad: 2, estado: 'cancelado' },
    { id: 22, cantidad: 1, estado: 'pendiente' },
  ]);
});

test('hacer un pedido pide una sesión de cliente, y el pedido es de quien lo hace', async () => {
  const nuevo = { productoId: 1, cantidad: 1 };
  assert.deepEqual(await codigos(['nadie', 'ana', 'reparto'], 'POST', '/v2/pedidos', nuevo), {
    nadie: 401,
    ana: 403,
    reparto: 403,
  });
  const res = await pedir('carmen', 'POST', '/v2/pedidos', nuevo);
  assert.equal(res.status, 201);
  const pedido = await res.json();
  assert.equal(pedido.clienteId, CARMEN);
  assert.equal((await pedir('pablo', 'GET', `/v2/pedidos/${pedido.id}`)).status, 404);
});

test('la misma Idempotency-Key de dos clientes: cada uno, su propio pedido', async () => {
  const conClave = (quien: string) =>
    app.request('/v2/pedidos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'la-misma',
        ...identidades[quien],
      },
      body: '{"productoId":2,"cantidad":1}',
    });
  const deCarmen = await (await conClave('carmen')).json();
  const dePablo = await conClave('pablo');
  assert.equal(dePablo.headers.get('idempotent-replayed'), null);
  const suyo = await dePablo.json();
  assert.notEqual(suyo.id, deCarmen.id);
  assert.equal(suyo.clienteId, PABLO);
});

test('la empresa de reparto marca como enviado un pedido pagado, y nada más', async () => {
  // El 13 está pagado.
  assert.deepEqual(await codigos(['nadie', 'carmen'], 'POST', '/v2/pedidos/13/envio'), {
    nadie: 401,
    carmen: 403,
  });
  const enviado = await pedir('reparto', 'POST', '/v2/pedidos/13/envio');
  assert.equal(enviado.status, 200);
  assert.equal((await enviado.json()).estado, 'enviado');
  // Ya enviado, otra vez no: 409. Uno pendiente (el 25), tampoco.
  assert.equal((await pedir('reparto', 'POST', '/v2/pedidos/13/envio')).status, 409);
  assert.equal((await pedir('reparto', 'POST', '/v2/pedidos/25/envio')).status, 409);
  assert.equal((await pedir('reparto', 'POST', '/v2/pedidos/999/envio')).status, 404);
});

test('los productos los gestiona admin: un cliente o el reparto, 403 sin WWW-Authenticate', async () => {
  const producto = { nombre: 'Chapa', precioCentimos: 200 };
  assert.deepEqual(
    await codigos(['nadie', 'carmen', 'reparto'], 'POST', '/v2/productos', producto),
    { nadie: 401, carmen: 403, reparto: 403 },
  );
  const prohibido = await pedir('reparto', 'DELETE', '/v2/productos/4');
  assert.equal(prohibido.status, 403);
  assert.equal(prohibido.headers.get('www-authenticate'), null);
  assert.equal((await prohibido.json()).title, 'Forbidden');
  assert.equal((await pedir('ana', 'POST', '/v2/productos', producto)).status, 201);
  assert.equal((await pedir('nadie', 'GET', '/v2/productos/4')).status, 200);
});

test('/v1 tiene las mismas protecciones', async () => {
  assert.equal((await pedir('nadie', 'GET', '/v1/pedidos')).status, 401);
  assert.equal((await pedir('carmen', 'GET', '/v1/pedidos/2')).status, 404);
  const producto = { nombre: 'Chapa', precio: 2 };
  assert.deepEqual(await codigos(['nadie', 'carmen', 'ana'], 'POST', '/v1/productos', producto), {
    nadie: 401,
    carmen: 403,
    ana: 201,
  });
});
