// Detrás del proxy (Nginx), la IP de quien pide llega en X-Forwarded-For, pero esa cabecera la
// puede escribir cualquiera: solo se lee si la conexión viene del proxy de confianza.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import { ipDeConProxies } from '../src/limites.ts';

const ejecutar = promisify(execFile);

// Una API mínima que contesta con la IP que calcula. Con app.request no hay conexión de verdad;
// la dirección va donde la busca getConnInfo.
const preguntar = async (
  proxies: string[],
  conexion: string,
  cabeceras: Record<string, string> = {},
) => {
  const app = new Hono().get('/ip', (c) => c.text(ipDeConProxies(c, proxies)));
  const res = await app.request(
    '/ip',
    { headers: cabeceras },
    { incoming: { socket: { remoteAddress: conexion } } },
  );
  return res.text();
};

const reenviada = { 'X-Forwarded-For': '203.0.113.7, 198.51.100.2' };

test('sin PROXY_CONFIABLE, la IP es la de la conexión aunque llegue X-Forwarded-For', async () => {
  assert.equal(await preguntar([], '172.18.0.1', reenviada), '172.18.0.1');
});

test('desde el proxy de confianza, la IP es la última de X-Forwarded-For', async () => {
  assert.equal(await preguntar(['172.18.0.1'], '172.18.0.1', reenviada), '198.51.100.2');
});

test('desde otra dirección, X-Forwarded-For se ignora', async () => {
  assert.equal(await preguntar(['172.18.0.1'], '203.0.113.9', reenviada), '203.0.113.9');
});

test('con espacios, IPv6 y una IPv4 escrita como IPv6 (::ffff:172.18.0.1) el proxy se reconoce', async () => {
  assert.equal(await preguntar(['172.18.0.1'], '::ffff:172.18.0.1', reenviada), '198.51.100.2');
  assert.equal(await preguntar(['::ffff:172.18.0.1'], '172.18.0.1', reenviada), '198.51.100.2');
  assert.equal(
    await preguntar(['2001:db8::1'], '2001:db8::1', {
      'X-Forwarded-For': ' 203.0.113.7 ,  2001:db8::99 ',
    }),
    '2001:db8::99',
  );
});

test('desde el proxy pero sin X-Forwarded-For, la IP es la de la conexión', async () => {
  assert.equal(await preguntar(['172.18.0.1'], '172.18.0.1'), '172.18.0.1');
});

test('PROXY_CONFIABLE con algo que no es una IP: el servidor no arranca', async () => {
  await assert.rejects(
    ejecutar('node', ['--input-type=module', '-e', "await import('./src/config.ts')"], {
      env: { ...process.env, PROXY_CONFIABLE: '172.18.0.1, nginx' },
    }),
    (error: { code: number; stderr: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /PROXY_CONFIABLE/);
      return true;
    },
  );
});
