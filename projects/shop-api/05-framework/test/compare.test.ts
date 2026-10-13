import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { app as expressApp } from '../compare/express.ts';
import { app as fastifyApp } from '../compare/fastify.ts';

test('Express returns the same products', async () => {
  const server = expressApp.listen(0, '127.0.0.1');
  await new Promise((ready) => server.once('listening', ready));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/products`);
  assert.equal((await res.json()).length, 3);
  server.close();
});

test('Fastify returns the same products', async () => {
  const res = await fastifyApp.inject({ method: 'GET', url: '/products' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 3);
});
