// Las comprobaciones de salud (Fase 10, lección 6): /salud/viva (¿el proceso contesta?) y
// /salud/lista (¿puede atender: contestan PostgreSQL y el Redis de la cola?). Y un fallo de una
// dependencia que ya no tumba la API: el error de una conexión de PostgreSQL prestada (bd.ts).
// Para que la base de datos falle o no conteste, se cambia pool.query en el test (mock.method): un
// PostgreSQL congelado de verdad se prueba en la lección, con docker compose pause db.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { comprobaciones } from '../src/salud.ts';
import { usarBd } from './bd.ts';

usarBd();

const nunca = () => new Promise<never>(() => {});

test('GET /salud/viva: 200, sin preguntar a nadie', async () => {
  const res = await app.request('/salud/viva');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { estado: 'ok' });
});

test('GET /salud/viva: 200 aunque PostgreSQL falle', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('ECONNREFUSED');
  });
  const res = await app.request('/salud/viva');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { estado: 'ok' });
});

test('GET /salud/lista: 200 con lo que contesta; lo que no está configurado no cuenta', async () => {
  const res = await app.request('/salud/lista');
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, 'ok');
  assert.equal(cuerpo.comprobaciones.bd, 'ok');
  // Sin REDIS_URL ni CACHE_URL (los tests no los ponen), la tienda funciona sin ellos.
  assert.deepEqual(cuerpo.comprobaciones, {
    bd: 'ok',
    cola: process.env.REDIS_URL ? 'ok' : 'sin-configurar',
    cache: process.env.CACHE_URL ? 'ok' : 'sin-configurar',
  });
});

test('GET /salud/lista: 503 con bd: falla, en menos de 1 s, si PostgreSQL no contesta', async (t) => {
  t.mock.method(pool, 'query', nunca);
  const antes = performance.now();
  const res = await app.request('/salud/lista');
  assert.ok(performance.now() - antes < 1000, `${performance.now() - antes} ms`);
  assert.equal(res.status, 503);
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, 'falla');
  assert.equal(cuerpo.comprobaciones.bd, 'falla');
});

test('GET /salud/lista: 503 si el Redis de la cola falla', async (t) => {
  t.mock.method(comprobaciones, 'cola', async () => {
    throw new Error('ECONNREFUSED');
  });
  const res = await app.request('/salud/lista');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).comprobaciones.cola, 'falla');
});

test('GET /salud/lista: la caché que falla se dice, pero no la hace fallar (200)', async (t) => {
  t.mock.method(comprobaciones, 'cache', nunca);
  const res = await app.request('/salud/lista');
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, 'ok');
  assert.equal(cuerpo.comprobaciones.cache, 'falla');
});

test('GET /salud no cambia: 200 {"estado":"ok"} cuando PostgreSQL contesta', async () => {
  const res = await app.request('/salud');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { estado: 'ok' });
});

test('bd.ts: el error de una conexión prestada no para la API, y se dice una vez en el log', async (t) => {
  // Así le llega a la tienda que PostgreSQL ha cortado una conexión que estaba usando (por ejemplo,
  // por idle_in_transaction_session_timeout, en salientes.ts). Sin nadie que escuche el 'error',
  // emit lanzaría el error, y en la API de verdad, Node pararía el proceso.
  const aviso = t.mock.method(console, 'warn', () => {});
  const cliente = await pool.connect();
  try {
    assert.doesNotThrow(() =>
      cliente.emit('error', new Error('terminating connection due to idle-in-transaction timeout')),
    );
    assert.equal(aviso.mock.callCount(), 1);
    assert.match(String(aviso.mock.calls[0]!.arguments.join(' ')), /idle-in-transaction/);
  } finally {
    // true: la conexión no vuelve al pool, se cierra (como haría pg con una que ha fallado).
    cliente.release(true);
  }
  mock.restoreAll();
});
