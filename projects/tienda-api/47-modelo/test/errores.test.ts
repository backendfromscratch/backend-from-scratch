import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { usarBd } from './bd.ts';

usarBd();

const ejecutar = promisify(execFile);

// La API ya no tiene una ruta que falle a propósito: el test añade la suya.
app.get('/prueba-de-error', () => {
  throw new Error('Algo ha fallado a propósito');
});

test('un error inesperado: 500 sin detalles, con el id de la petición en instance', async () => {
  const res = await app.request('/prueba-de-error');
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  const cuerpo = await res.json();
  assert.deepEqual(Object.keys(cuerpo), ['type', 'title', 'status', 'detail', 'instance']);
  assert.equal(cuerpo.title, 'Internal Server Error');
  assert.equal(cuerpo.instance, `urn:uuid:${res.headers.get('x-request-id')}`);
  assert.match(cuerpo.instance, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(cuerpo), /a propósito|at /);
});

test('los secretos salen de las variables de entorno', () => {
  assert.equal(config.WEBHOOK_SECRET, 'secreto-de-los-tests-0123456789abcdef');
  assert.equal(config.OIDC_CLIENTE_SECRETO, 'secreto-del-proveedor-de-los-tests-0123');
});

test('sin WEBHOOK_SECRET, el servidor no arranca y dice por qué', async () => {
  const resultado = await ejecutar('node', ['src/servidor.ts'], {
    env: { PATH: process.env.PATH },
  }).catch((error) => error);
  assert.equal(resultado.code, 1);
  assert.match(resultado.stderr, /Configuración: WEBHOOK_SECRET: Falta WEBHOOK_SECRET/);
});

test('cada petición escribe una línea JSON con su id', async () => {
  const codigo = `
    const { app } = await import('./src/app.ts');
    await app.request('/v2/productos/2', { headers: { 'X-Request-Id': 'prueba-1' } });
    await (await import('./src/bd.ts')).pool.end();
  `;
  const { stdout } = await ejecutar('node', ['--input-type=module', '-e', codigo], {
    env: { ...process.env, LOG_LEVEL: 'info' },
  });
  const linea = JSON.parse(stdout.trim().split('\n').at(-1)!);
  assert.equal(linea.msg, 'petición');
  assert.equal(linea.requestId, 'prueba-1');
  assert.equal(linea.ruta, '/v2/productos/2');
  assert.equal(linea.estado, 200);
  assert.equal(linea.level, 30);
});
