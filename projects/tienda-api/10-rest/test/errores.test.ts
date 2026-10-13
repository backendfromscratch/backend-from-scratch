import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';

const ejecutar = promisify(execFile);

// La API ya no tiene una ruta que falle a propósito: el test añade la suya.
app.get('/prueba-de-error', () => {
  throw new Error('Algo ha fallado a propósito');
});

test('un error inesperado: 500 sin detalles, con el id de la petición', async () => {
  const res = await app.request('/prueba-de-error');
  assert.equal(res.status, 500);
  const cuerpo = await res.json();
  assert.deepEqual(Object.keys(cuerpo), ['error', 'requestId']);
  assert.equal(cuerpo.error, 'Error interno del servidor');
  assert.equal(res.headers.get('x-request-id'), cuerpo.requestId);
  assert.doesNotMatch(JSON.stringify(cuerpo), /a propósito|at /);
});

test('una ruta que no existe: 404 en JSON', async () => {
  const res = await app.request('/ofertas');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No existe esa ruta' });
});

test('un cuerpo que no es JSON: 400, también en JSON', async () => {
  const res = await app.request('/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'esto no es JSON',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: 'La petición no se puede leer',
    detalle: 'Malformed JSON in request body',
  });
});

test('el token sale de la variable de entorno', async () => {
  assert.equal(config.ADMIN_TOKEN, 'token-de-los-tests-0123456789');
  const res = await app.request('/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ADMIN_TOKEN}` },
    body: '{"nombre":"Gorra","precio":15}',
  });
  assert.equal(res.status, 201);
});

test('sin ADMIN_TOKEN, el servidor no arranca y dice por qué', async () => {
  const resultado = await ejecutar('node', ['src/servidor.ts'], {
    env: { PATH: process.env.PATH },
  }).catch((error) => error);
  assert.equal(resultado.code, 1);
  assert.match(resultado.stderr, /Configuración: ADMIN_TOKEN: Falta ADMIN_TOKEN/);
});

test('cada petición escribe una línea JSON con su id', async () => {
  const codigo = `
    const { app } = await import('./src/app.ts');
    await app.request('/productos/2', { headers: { 'X-Request-Id': 'prueba-1' } });
  `;
  const { stdout } = await ejecutar('node', ['--input-type=module', '-e', codigo], {
    env: { ...process.env, LOG_LEVEL: 'info' },
  });
  const linea = JSON.parse(stdout.trim().split('\n').at(-1)!);
  assert.equal(linea.msg, 'petición');
  assert.equal(linea.requestId, 'prueba-1');
  assert.equal(linea.ruta, '/productos/2');
  assert.equal(linea.estado, 200);
  assert.equal(linea.level, 30);
});
