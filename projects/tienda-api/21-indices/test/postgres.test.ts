import assert from 'node:assert/strict';
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { config } from '../src/config.ts';
import { apuntarEvento } from '../src/datos.ts';
import { usarBd } from './bd.ts';

usarBd();

const ejecutar = promisify(execFile);
const admin = { Authorization: `Bearer ${config.ADMIN_TOKEN}` };

// Ninguna ruta de la API crea categorías: el test añade la suya, con un nombre que ya existe.
app.get('/prueba-de-repetido', async (c) => {
  await pool.query(`INSERT INTO categorias (nombre) VALUES ('Ropa')`);
  return c.text('no debería llegar aquí');
});

/** Arranca src/servidor.ts en un puerto libre y devuelve el proceso y su dirección. */
async function arrancar(): Promise<{ servidor: ChildProcess; url: string }> {
  const libre = createServer().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as { port: number }).port;
  libre.close();
  const servidor = spawn('node', ['src/servidor.ts'], {
    env: { ...process.env, PORT: String(puerto), LOG_LEVEL: 'info' },
  });
  await once(servidor.stdout!, 'data'); // la línea «La tienda escucha en…»
  return { servidor, url: `http://127.0.0.1:${puerto}` };
}

/** Para el servidor y espera a que termine. */
async function parar(servidor: ChildProcess) {
  servidor.kill();
  await once(servidor, 'exit');
}

test('los datos sobreviven a un reinicio del servidor, también las claves de idempotencia', async () => {
  const pedir = (url: string) =>
    fetch(`${url}/v2/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'antes-del-reinicio' },
      body: '{"productoId":3,"cantidad":2}',
    });

  const primero = await arrancar();
  const creado = await (await pedir(primero.url)).json();
  await parar(primero.servidor);

  // Otro proceso, con su propio pool: lo único que comparte con el anterior es la base de datos.
  const segundo = await arrancar();
  try {
    const leido = await fetch(`${segundo.url}/v2/pedidos/${creado.id}`);
    assert.equal(leido.status, 200);
    assert.deepEqual(await leido.json(), creado);
    const repetido = await pedir(segundo.url);
    assert.equal(repetido.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await repetido.json(), creado);
  } finally {
    await parar(segundo.servidor);
  }
});

test('cada fila sale con los nombres de la API: precioCentimos, productoId y creadoEn en ISO 8601', async () => {
  assert.deepEqual(await (await app.request('/v2/productos/4')).json(), {
    id: 4,
    nombre: 'Gorra',
    precioCentimos: 1500,
    stock: 15,
  });
  assert.deepEqual(await (await app.request('/v2/pedidos/1')).json(), {
    id: 1,
    productoId: 2,
    cantidad: 2,
    estado: 'enviado',
    creadoEn: '2026-10-01T09:00:00.000Z',
  });
});

test('borrar un producto con pedidos: 409 como Problem Details, y el producto sigue ahí', async () => {
  const res = await app.request('/v2/productos/1', { method: 'DELETE', headers: admin });
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(await res.json(), {
    type: 'about:blank',
    title: 'Conflict',
    status: 409,
    detail:
      'Otros datos dependen de este: un producto con pedidos, por ejemplo, no se puede borrar',
  });
  assert.equal((await app.request('/v2/productos/1')).status, 200);
  const doc = await (await app.request('/v2/openapi.json')).json();
  assert.ok(doc.paths['/productos/{id}'].delete.responses['409']);
});

test('un valor repetido donde tiene que ser único (23505): 409, no 500', async () => {
  const res = await app.request('/prueba-de-repetido');
  assert.equal(res.status, 409);
  assert.equal((await res.json()).detail, 'Ya existe un dato igual, y no se puede repetir');
});

test('un aviso de pago queda apuntado en eventos_procesados', async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM eventos_procesados');
  assert.equal(rows[0].n, 0);
  assert.equal(await apuntarEvento('evt_prueba'), true);
  assert.equal(await apuntarEvento('evt_prueba'), false, 'la segunda vez ya estaba');
});

test('ejemplos/inyeccion.ts: pegando el texto, el valor malicioso trae todo; con un parámetro, nada', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/inyeccion.ts']);
  const [normal, malicioso] = stdout.split('\nSe busca: ').slice(1);
  assert.match(normal!, /Pegando el texto, encuentra: \[ 'Taza' \]/);
  assert.match(normal!, /Con un parámetro, encuentra: \[ 'Taza' \]/);
  assert.match(
    malicioso!,
    /La consulta: SELECT nombre FROM productos WHERE nombre = 'x' OR '1'='1' ORDER BY id$/m,
  );
  assert.match(
    malicioso!,
    /Pegando el texto, encuentra: \[ 'Camiseta', 'Taza', 'Sudadera', 'Gorra' \]/,
  );
  assert.match(malicioso!, /Con un parámetro, encuentra: \[\]/);
});

test('sin DATABASE_URL, el servidor no arranca y dice por qué', async () => {
  const { DATABASE_URL, ...sinBaseDeDatos } = process.env;
  const resultado = await ejecutar('node', ['src/servidor.ts'], { env: sinBaseDeDatos }).catch(
    (error) => error,
  );
  assert.equal(resultado.code, 1);
  assert.match(resultado.stderr, /Configuración: DATABASE_URL: Falta DATABASE_URL/);
});
