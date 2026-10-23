import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { enTransaccion, pool } from '../src/bd.ts';
import { config } from '../src/config.ts';
import { buscarPedido, cambiarCantidad, cambiarEstado, crearPedido } from '../src/datos.ts';
import { firmar } from '../src/firma.ts';
import { ejecutar, usarBd } from './bd.ts';

usarBd();

const pedir = (productoId: number, cantidad: number) =>
  app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productoId, cantidad }),
  });

const stock = async (productoId: number) =>
  (await pool.query('SELECT stock FROM productos WHERE id = $1', [productoId])).rows[0].stock;

const cambiar = (id: number, cantidad: number) =>
  app.request(`/v2/pedidos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cantidad }),
  });

const cancelar = (id: number) => app.request(`/v2/pedidos/${id}/cancelacion`, { method: 'POST' });

// Un aviso de pago de la pasarela, firmado, con un id de evento nuevo cada vez.
const pagar = (pedidoId: number) => {
  const cuerpo = JSON.stringify({ id: randomUUID(), tipo: 'pago.completado', pedidoId });
  return app.request('/v2/webhooks/pagos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firma': firmar(cuerpo, config.WEBHOOK_SECRET),
    },
    body: cuerpo,
  });
};

test('20 pedidos a la vez de un producto con stock 5: 5 se hacen, 15 reciben 409, y el stock queda en 0', async () => {
  await pool.query('UPDATE productos SET stock = 5 WHERE id = 4');
  const respuestas = await Promise.all(Array.from({ length: 20 }, () => pedir(4, 1)));
  const codigos = respuestas.map((res) => res.status);
  assert.equal(codigos.filter((codigo) => codigo === 201).length, 5);
  assert.equal(codigos.filter((codigo) => codigo === 409).length, 15);
  assert.equal(await stock(4), 0);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM pedidos WHERE producto_id = 4');
  assert.equal(rows[0].n, 5);
});

test('sin bastante stock: 409, con su propio tipo y lo que queda en detail', async () => {
  await pool.query('UPDATE productos SET stock = 2 WHERE id = 3');
  const res = await pedir(3, 3);
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(await res.json(), {
    type: 'https://tienda.example/problemas/sin-stock',
    title: 'No queda bastante stock',
    status: 409,
    detail: 'Pides 3 y quedan 2',
  });
  assert.equal(await stock(3), 2, 'el stock no cambia');
});

test('un pedido quita su cantidad del stock; cancelarlo la devuelve, una sola vez', async () => {
  const antes = await stock(1);
  const pedido = await (await pedir(1, 2)).json();
  assert.equal(await stock(1), antes - 2);
  for (let vez = 1; vez <= 2; vez++) {
    const res = await app.request(`/v2/pedidos/${pedido.id}/cancelacion`, { method: 'POST' });
    assert.equal((await res.json()).estado, 'cancelado');
  }
  assert.equal(await stock(1), antes);
});

test('un error a mitad de la transacción deja el stock como estaba', async () => {
  const antes = await stock(1);
  // Una cantidad negativa no pasaría la validación de la API, pero aquí sirve: el UPDATE del stock
  // funciona (suma 3) y el INSERT del pedido falla por su CHECK (cantidad > 0). ROLLBACK deshace
  // el UPDATE.
  await assert.rejects(crearPedido(1, -3), { code: '23514' });
  assert.equal(await stock(1), antes);
});

test('enTransaccion: si la función lanza un error, no se guarda nada de lo que hizo', async () => {
  const antes = await stock(2);
  await assert.rejects(
    enTransaccion(async (cliente) => {
      await cliente.query('UPDATE productos SET stock = 0 WHERE id = 2');
      throw new Error('algo falla después del UPDATE');
    }),
    /algo falla después del UPDATE/,
  );
  assert.equal(await stock(2), antes);
});

test('pedir más unidades de un pedido pendiente quita la diferencia del stock', async () => {
  const antes = await stock(1);
  const pedido = await (await pedir(1, 2)).json();
  const res = await cambiar(pedido.id, 5);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).cantidad, 5);
  assert.equal(await stock(1), antes - 5);
});

test('pedir más unidades de las que quedan: 409, con lo que queda, y no cambia ni el pedido ni el stock', async () => {
  await pool.query('UPDATE productos SET stock = 3 WHERE id = 3');
  const pedido = await (await pedir(3, 2)).json(); // queda 1
  const res = await cambiar(pedido.id, 4); // 2 más
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(await res.json(), {
    type: 'https://tienda.example/problemas/sin-stock',
    title: 'No queda bastante stock',
    status: 409,
    detail: 'Pides 2 más y quedan 1',
  });
  assert.equal((await buscarPedido(pedido.id))!.cantidad, 2);
  assert.equal(await stock(3), 1);
});

test('pedir menos unidades devuelve la diferencia al stock', async () => {
  const antes = await stock(1);
  const pedido = await (await pedir(1, 5)).json();
  const res = await cambiar(pedido.id, 2);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).cantidad, 2);
  assert.equal(await stock(1), antes - 2);
});

test('cambiar la cantidad y después cancelar deja el stock como antes del pedido', async () => {
  const antes = await stock(1);
  const pedido = await (await pedir(1, 1)).json();
  assert.equal((await cambiar(pedido.id, 4)).status, 200);
  assert.equal((await cambiar(pedido.id, 3)).status, 200);
  assert.equal((await cancelar(pedido.id)).status, 200);
  assert.equal(await stock(1), antes);
});

test('cambiar la cantidad y cancelar a la vez: el stock queda como antes de los pedidos', async () => {
  const antes = await stock(2);
  const ids: number[] = [];
  for (let vez = 1; vez <= 10; vez++) ids.push((await (await pedir(2, 1)).json()).id);
  // Cada pedido recibe las dos peticiones a la vez: cambiar puede llegar antes (200) o después de
  // cancelar (409). Pase lo que pase, al final todo el stock ha vuelto.
  const respuestas = await Promise.all(ids.flatMap((id) => [cambiar(id, 3), cancelar(id)]));
  for (const res of respuestas) assert.ok([200, 409].includes(res.status), `${res.status}`);
  for (const id of ids) assert.equal((await buscarPedido(id))!.estado, 'cancelado');
  assert.equal(await stock(2), antes);
});

test('un pedido que ya no está pendiente: 409, y no cambia ni el pedido ni el stock', async () => {
  const pedido = await (await pedir(1, 2)).json();
  await cambiarEstado(pedido.id, 'pagado');
  const antes = await stock(1);
  assert.equal((await cambiar(pedido.id, 5)).status, 409);
  // La ruta lo ve antes de llamar a cambiarCantidad; cambiarCantidad lo vuelve a mirar, con el
  // pedido bloqueado, por si lo pagan justo entre una cosa y otra.
  assert.deepEqual(await cambiarCantidad(pedido.id, 5), { error: 'estado', estado: 'pagado' });
  assert.equal((await buscarPedido(pedido.id))!.cantidad, 2);
  assert.equal(await stock(1), antes);
});

test('pagar y cancelar a la vez: un pedido cancelado no vuelve a pagado, y el stock vuelve una sola vez', async () => {
  const antes = await stock(2);
  const ids: number[] = [];
  for (let vez = 1; vez <= 10; vez++) ids.push((await (await pedir(2, 1)).json()).id);
  // Si el pago llega antes, se cancela un pedido pagado; si llega después, ya no lo paga.
  const respuestas = await Promise.all(ids.flatMap((id) => [pagar(id), cancelar(id)]));
  for (const res of respuestas) assert.equal(res.status, 200);
  for (const id of ids) assert.equal((await buscarPedido(id))!.estado, 'cancelado');
  // Cancelar otra vez no devuelve nada más.
  for (const id of ids) assert.equal((await cancelar(id)).status, 200);
  assert.equal(await stock(2), antes);
});

test('pagar y cambiar la cantidad a la vez: el pedido queda pagado con la cantidad final, y el stock cuadra', async () => {
  const antes = await stock(2);
  const ids: number[] = [];
  for (let vez = 1; vez <= 10; vez++) ids.push((await (await pedir(2, 1)).json()).id);
  // Si el cambio llega antes, se paga el pedido de 3; si llega después, 409, y se paga el de 1.
  await Promise.all(ids.flatMap((id) => [pagar(id), cambiar(id, 3)]));
  let pedidas = 0;
  for (const id of ids) {
    const pedido = (await buscarPedido(id))!;
    assert.equal(pedido.estado, 'pagado');
    pedidas += pedido.cantidad;
  }
  assert.equal(await stock(2), antes - pedidas);
});

test('ejemplos/carrera.ts: leyendo y escribiendo por separado se vende de más; con un UPDATE condicional, no', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/carrera.ts']);
  assert.match(stdout, /^Mal: quedaba 1 taza y se han vendido 10\. Stock: 0$/m);
  assert.match(stdout, /^Bien: quedaba 1 taza y se han vendido 1\. Stock: 0$/m);
});

test('el contrato documenta el 409 de POST /pedidos', async () => {
  const doc = await (await app.request('/v2/openapi.json')).json();
  assert.deepEqual(Object.keys(doc.paths['/pedidos'].post.responses), ['201', '409', '422']);
});
