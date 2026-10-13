import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { app as appExpress } from '../comparar/express.ts';
import { app as appFastify } from '../comparar/fastify.ts';

test('Express devuelve los mismos productos', async () => {
  const servidor = appExpress.listen(0, '127.0.0.1');
  await new Promise((listo) => servidor.once('listening', listo));
  try {
    const { port } = servidor.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/productos`);
    assert.equal((await res.json()).length, 3);
  } finally {
    // Aunque la comprobación falle, el servidor se cierra y los tests no se quedan colgados.
    servidor.close();
  }
});

test('Fastify devuelve los mismos productos', async () => {
  const res = await appFastify.inject({ method: 'GET', url: '/productos' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 3);
});
