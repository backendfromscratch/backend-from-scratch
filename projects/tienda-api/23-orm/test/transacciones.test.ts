import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { bd, pool } from '../src/bd.ts';
import { crearPedido } from '../src/datos.ts';
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
  // Drizzle envuelve el error de PostgreSQL: su código va en cause.
  await assert.rejects(crearPedido(1, -3), (error: Error) => {
    assert.equal((error.cause as { code: string }).code, '23514');
    return true;
  });
  assert.equal(await stock(1), antes);
});

test('bd.transaction: si la función lanza un error, no se guarda nada de lo que hizo', async () => {
  const antes = await stock(2);
  await assert.rejects(
    bd.transaction(async (tx) => {
      await tx.execute('UPDATE productos SET stock = 0 WHERE id = 2');
      throw new Error('algo falla después del UPDATE');
    }),
    /algo falla después del UPDATE/,
  );
  assert.equal(await stock(2), antes);
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
