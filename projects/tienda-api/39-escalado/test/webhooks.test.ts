import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { buscarPedido, cambiarEstado } from '../src/datos.ts';
import { firmar } from '../src/firma.ts';
import { usarBd } from './bd.ts';
import { CARMEN, comoUsuario } from './identidades.ts';

// Los pedidos los hace Carmen, una clienta.
let carmen: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
});

const ejecutar = promisify(execFile);

/** Crea un pedido pendiente y devuelve su id. */
async function pedidoNuevo(cabeceras: Record<string, string> = {}): Promise<number> {
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen, ...cabeceras },
    body: '{"productoId":1,"cantidad":1}',
  });
  return (await res.json()).id;
}

/** Manda un webhook con el cuerpo y la firma que se le den. */
const avisar = (cuerpo: string, firma?: string) =>
  app.request('/v2/webhooks/pagos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(firma ? { 'X-Firma': firma } : {}) },
    body: cuerpo,
  });

const evento = (id: string, pedidoId: number) =>
  JSON.stringify({ id, tipo: 'pago.completado', pedidoId });

test('la firma: sha256= y 64 cifras hexadecimales; cambia si cambia un byte', () => {
  assert.match(firmar('{"a":1}', 'secreto'), /^sha256=[0-9a-f]{64}$/);
  assert.notEqual(firmar('{"a":1}', 'secreto'), firmar('{"a":2}', 'secreto'));
  assert.notEqual(firmar('{"a":1}', 'secreto'), firmar('{"a":1}', 'otro secreto'));
});

test('un aviso con la firma correcta: 200, y el pedido pasa a pagado', async () => {
  const id = await pedidoNuevo();
  const cuerpo = evento('evt_1', id);
  const res = await avisar(cuerpo, firmar(cuerpo, config.WEBHOOK_SECRET));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { recibido: 'evt_1', repetido: false });
  assert.equal((await buscarPedido(id))!.estado, 'pagado');
});

test('el mismo evento otra vez: se acusa recibo, pero no se procesa de nuevo', async () => {
  const id = await pedidoNuevo();
  const cuerpo = evento('evt_2', id);
  const firma = firmar(cuerpo, config.WEBHOOK_SECRET);
  await avisar(cuerpo, firma);
  // Entre medias, el pedido se cancela: si el evento se procesara otra vez, no debería cambiar.
  await cambiarEstado(id, 'cancelado');
  const res = await avisar(cuerpo, firma);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { recibido: 'evt_2', repetido: true });
  assert.equal((await buscarPedido(id))!.estado, 'cancelado');
});

test('un cuerpo cambiado por el camino: 400, y el pedido no cambia', async () => {
  const id = await pedidoNuevo();
  const original = evento('evt_3', id - 1);
  const manipulado = evento('evt_3', id);
  const res = await avisar(manipulado, firmar(original, config.WEBHOOK_SECRET));
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).type, 'https://tienda.example/problemas/firma-no-valida');
  assert.equal((await buscarPedido(id))!.estado, 'pendiente');
});

test('sin firma, o firmado con otro secreto: 400', async () => {
  const cuerpo = evento('evt_4', 1);
  assert.equal((await avisar(cuerpo)).status, 400);
  assert.equal((await avisar(cuerpo, firmar(cuerpo, 'un-secreto-que-no-es-el-bueno'))).status, 400);
  assert.equal((await avisar(cuerpo, 'sha256=corta')).status, 400);
});

test('bien firmado, pero un evento que no vale o de un pedido que no existe: 422', async () => {
  const otroTipo = JSON.stringify({ id: 'evt_5', tipo: 'pago.devuelto', pedidoId: 1 });
  const res = await avisar(otroTipo, firmar(otroTipo, config.WEBHOOK_SECRET));
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errores, [
    { campo: 'tipo', problema: 'Solo se aceptan pagos completados' },
  ]);
  const sinPedido = evento('evt_6', 999);
  const otro = await avisar(sinPedido, firmar(sinPedido, config.WEBHOOK_SECRET));
  assert.equal(otro.status, 422);
  assert.deepEqual((await otro.json()).errores, [
    { campo: 'pedidoId', problema: 'No existe ese pedido' },
  ]);
});

test('Idempotency-Key: repetir la petición devuelve la misma respuesta, sin crear otro pedido', async () => {
  const pedir = () =>
    app.request('/v2/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'clave-1', ...carmen },
      body: '{"productoId":2,"cantidad":3}',
    });
  const primera = await pedir();
  const segunda = await pedir();
  assert.equal(primera.status, 201);
  assert.equal(segunda.status, 201);
  assert.equal(primera.headers.get('idempotent-replayed'), null);
  assert.equal(segunda.headers.get('idempotent-replayed'), 'true');
  assert.equal(segunda.headers.get('location'), primera.headers.get('location'));
  assert.deepEqual(await segunda.json(), await primera.json());
  const siguiente = await pedidoNuevo();
  assert.equal(siguiente, Number(primera.headers.get('location')!.split('/').at(-1)) + 1);
});

test('la respuesta repetida lleva el X-Request-Id de su propia petición', async () => {
  const pedir = () =>
    app.request('/v2/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'clave-3', ...carmen },
      body: '{"productoId":1,"cantidad":2}',
    });
  const primera = await pedir();
  const segunda = await pedir();
  assert.equal(segunda.headers.get('idempotent-replayed'), 'true');
  // Es otra petición: su id es suyo, no el de la primera.
  const id = segunda.headers.get('x-request-id');
  assert.match(id ?? '', /^[0-9a-f-]{36}$/);
  assert.notEqual(id, primera.headers.get('x-request-id'));
});

test('la misma clave con otros datos: 422', async () => {
  await pedidoNuevo({ 'Idempotency-Key': 'clave-2' });
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'clave-2', ...carmen },
    body: '{"productoId":3,"cantidad":1}',
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).type, 'https://tienda.example/problemas/clave-reutilizada');
});

test('sin Idempotency-Key, cada petición crea un pedido', async () => {
  assert.notEqual(await pedidoNuevo(), await pedidoNuevo());
});

test('scripts/pasarela.ts: avisa, con --manipular le dicen 400 y con --repetir, repetido', async () => {
  const servidor = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise((listo) => servidor.once('listening', listo));
  const env = {
    ...process.env,
    TIENDA_URL: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`,
  };
  const pasarela = (...argumentos: string[]) =>
    ejecutar('node', ['scripts/pasarela.ts', ...argumentos], { env });
  try {
    const id = await pedidoNuevo();
    const manipulado = await pasarela(String(id), '--manipular');
    assert.match(manipulado.stdout, /^← 400 /m);
    assert.equal((await buscarPedido(id))!.estado, 'pendiente');

    const repetido = await pasarela(String(id), '--repetir');
    const respuestas = repetido.stdout.split('\n').filter((linea) => linea.startsWith('←'));
    assert.match(respuestas[0]!, /^← 200 .*"repetido":false/);
    assert.match(respuestas[1]!, /^← 200 .*"repetido":true/);
    assert.equal((await buscarPedido(id))!.estado, 'pagado');
  } finally {
    servidor.close();
  }
});
