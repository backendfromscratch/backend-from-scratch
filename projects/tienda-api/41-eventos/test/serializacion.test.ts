import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { usarBd } from './bd.ts';
import { ANA, CARMEN, comoUsuario } from './identidades.ts';

// Carmen, clienta, hace pedidos; Ana, admin, ve todos.
let ana: Record<string, string>;
let carmen: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
});

const ejecutar = promisify(execFile);

// Una fecha en ISO 8601, en UTC: 2026-10-13T09:30:00.000Z.
const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('un pedido nuevo lleva creadoEn: la hora de ahora, en ISO 8601 y en UTC', async () => {
  const antes = Date.now();
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"productoId":1,"cantidad":1}',
  });
  const { creadoEn } = await res.json();
  assert.match(creadoEn, iso8601);
  const cuando = Date.parse(creadoEn);
  assert.ok(cuando >= antes - 1000 && cuando <= Date.now() + 1000);
});

test('los pedidos de ejemplo tienen fecha, y los más nuevos van primero', async () => {
  const pedidos = await (
    await app.request('/v2/pedidos?estado=enviado&limite=3', { headers: ana })
  ).json();
  assert.deepEqual(
    pedidos.map((pedido: { creadoEn: string }) => pedido.creadoEn),
    ['2026-10-04T14:00:00.000Z', '2026-10-04T07:00:00.000Z', '2026-10-04T00:00:00.000Z'],
  );
});

test('v1 también da creadoEn: añadir un campo no rompe a nadie', async () => {
  const pedido = await (await app.request('/v1/pedidos/1', { headers: ana })).json();
  assert.equal(pedido.creadoEn, '2026-10-01T09:00:00.000Z');
});

test('en el contrato, creadoEn es un texto con formato date-time, y obligatorio', async () => {
  const doc = await (await app.request('/v2/openapi.json')).json();
  const pedido = doc.components.schemas.Pedido;
  assert.equal(pedido.properties.creadoEn.type, 'string');
  assert.equal(pedido.properties.creadoEn.format, 'date-time');
  assert.ok(pedido.required.includes('creadoEn'));
});

test('ejemplos/protobuf.ts: el mismo pedido ocupa menos en Protobuf, y se lee igual', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/protobuf.ts']);
  const json = Number(stdout.match(/^JSON: (\d+) bytes$/m)?.[1]);
  const protobuf = Number(stdout.match(/^Protobuf: (\d+) bytes$/m)?.[1]);
  assert.equal(json, 95);
  assert.equal(protobuf, 34);
  assert.match(stdout, /^08 07 10 01 18 02 20 01 2a 18/m);
  assert.match(stdout, /productoId: 1,/);
  assert.match(stdout, /creadoEn: '2026-10-13T09:30:00.000Z'/);
});

test('ejemplos/dinero.ts: con decimales la suma falla; en céntimos, no', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/dinero.ts']);
  assert.match(stdout, /^0\.1 \+ 0\.2 = 0\.30000000000000004$/m);
  assert.match(stdout, /^¿0\.1 \+ 0\.2 es 0\.3\? false$/m);
  assert.match(stdout, /^En euros: 8\.799999999999999$/m);
  assert.match(stdout, /^En céntimos: 880$/m);
  // Intl separa la cifra y el símbolo con un espacio que no se parte (U+00A0).
  assert.match(stdout, /^Para enseñarlo: 8,80 €$/m);
});
