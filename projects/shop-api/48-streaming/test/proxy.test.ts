// Behind the proxy (Nginx), the IP of whoever makes the request arrives in X-Forwarded-For, but
// anyone can write that header: it's only read if the connection comes from the trusted proxy.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import { ipOfWithProxies } from '../src/rate-limits.ts';

const execute = promisify(execFile);

// A minimal API that answers with the IP it works out. With app.request there's no real
// connection; the address goes where getConnInfo looks for it.
const ask = async (proxies: string[], connection: string, headers: Record<string, string> = {}) => {
  const app = new Hono().get('/ip', (c) => c.text(ipOfWithProxies(c, proxies)));
  const res = await app.request(
    '/ip',
    { headers },
    { incoming: { socket: { remoteAddress: connection } } },
  );
  return res.text();
};

const forwarded = { 'X-Forwarded-For': '203.0.113.7, 198.51.100.2' };

test('without TRUSTED_PROXY, the IP is the connection one even if X-Forwarded-For arrives', async () => {
  assert.equal(await ask([], '172.18.0.1', forwarded), '172.18.0.1');
});

test('from the trusted proxy, the IP is the last one in X-Forwarded-For', async () => {
  assert.equal(await ask(['172.18.0.1'], '172.18.0.1', forwarded), '198.51.100.2');
});

test('from any other address, X-Forwarded-For is ignored', async () => {
  assert.equal(await ask(['172.18.0.1'], '203.0.113.9', forwarded), '203.0.113.9');
});

test('with spaces, IPv6 and an IPv4 written as IPv6 (::ffff:172.18.0.1) the proxy is recognised', async () => {
  assert.equal(await ask(['172.18.0.1'], '::ffff:172.18.0.1', forwarded), '198.51.100.2');
  assert.equal(await ask(['::ffff:172.18.0.1'], '172.18.0.1', forwarded), '198.51.100.2');
  assert.equal(
    await ask(['2001:db8::1'], '2001:db8::1', {
      'X-Forwarded-For': ' 203.0.113.7 ,  2001:db8::99 ',
    }),
    '2001:db8::99',
  );
});

test('from the proxy but without X-Forwarded-For, the IP is the connection one', async () => {
  assert.equal(await ask(['172.18.0.1'], '172.18.0.1'), '172.18.0.1');
});

test('TRUSTED_PROXY with something that is not an IP: the server does not start', async () => {
  await assert.rejects(
    execute('node', ['--input-type=module', '-e', "await import('./src/config.ts')"], {
      env: { ...process.env, TRUSTED_PROXY: '172.18.0.1, nginx' },
    }),
    (error: { code: number; stderr: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /TRUSTED_PROXY/);
      return true;
    },
  );
});
