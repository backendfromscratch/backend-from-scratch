import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { cambiosDePedidos } from '../src/eventos-pedidos.ts';
import { firmar } from '../src/firma.ts';
import { usarBd } from './bd.ts';
import { ANA, comoUsuario } from './identidades.ts';

// Ana, admin: puede seguir y cancelar cualquier pedido.
let ana: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
});

type Lector = ReadableStreamDefaultReader<string>;

/** Abre el flujo de eventos de un pedido. */
async function seguir(id: number): Promise<{ res: Response; lector: Lector }> {
  const res = await app.request(`/v2/pedidos/${id}/eventos`, { headers: ana });
  return { res, lector: res.body!.pipeThrough(new TextDecoderStream()).getReader() };
}

/** Lee hasta el final del siguiente evento (una línea en blanco) y devuelve su nombre y sus datos. */
async function siguienteEvento(lector: Lector): Promise<{ event: string; data: unknown }> {
  let texto = '';
  while (!texto.includes('\n\n')) {
    const { value, done } = await lector.read();
    if (done) throw new Error('El flujo se ha cerrado');
    texto += value;
  }
  const event = texto.match(/^event: (.*)$/m)![1]!;
  const data = JSON.parse(texto.match(/^data: (.*)$/m)![1]!);
  return { event, data };
}

const cancelar = (id: number) =>
  app.request(`/v2/pedidos/${id}/cancelacion`, { method: 'POST', headers: ana });

test('SSE: text/event-stream, y lo primero, el estado de ahora', async () => {
  const { res, lector } = await seguir(25);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const primero = await siguienteEvento(lector);
  assert.equal(primero.event, 'estado');
  assert.deepEqual(primero.data, {
    id: 25,
    productoId: 2,
    cantidad: 2,
    estado: 'pendiente',
    creadoEn: '2026-10-08T09:00:00.000Z',
    clienteId: 3,
  });
  await lector.cancel();
});

test('SSE: cada cambio de ese pedido llega por la misma respuesta; los de otros, no', async () => {
  const { lector } = await seguir(24);
  await siguienteEvento(lector);
  await cancelar(23); // otro pedido: no tiene que llegar
  const cuerpo = JSON.stringify({ id: 'evt_sse', tipo: 'pago.completado', pedidoId: 24 });
  await app.request('/v2/webhooks/pagos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firma': firmar(cuerpo, config.WEBHOOK_SECRET),
    },
    body: cuerpo,
  });
  const pagado = await siguienteEvento(lector);
  assert.equal((pagado.data as { id: number }).id, 24);
  assert.equal((pagado.data as { estado: string }).estado, 'pagado');
  await cancelar(24);
  assert.equal(((await siguienteEvento(lector)).data as { estado: string }).estado, 'cancelado');
  await lector.cancel();
});

test('SSE: cuando el cliente se va, el servidor deja de escuchar los cambios', async () => {
  const antes = cambiosDePedidos.oyentes();
  const { lector } = await seguir(22);
  await siguienteEvento(lector);
  assert.equal(cambiosDePedidos.oyentes(), antes + 1);
  await lector.cancel();
  await new Promise((listo) => setImmediate(listo));
  assert.equal(cambiosDePedidos.oyentes(), antes);
});

test('SSE de un pedido que no existe: 404, como cualquier otro error', async () => {
  const res = await app.request('/v2/pedidos/999/eventos', { headers: ana });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
});

test('/eco sin pedir WebSocket: 426 Upgrade Required', async () => {
  const res = await app.request('/eco');
  assert.equal(res.status, 426);
  assert.equal(res.headers.get('upgrade'), 'websocket');
  assert.equal((await res.json()).title, 'Upgrade Required');
});

// Para WebSocket hace falta un servidor de verdad: se arranca src/servidor.ts en un puerto libre.
let servidor: ChildProcess;
let puerto: number;

before(async () => {
  const libre = createServer().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  puerto = (libre.address() as { port: number }).port;
  libre.close();
  servidor = spawn('node', ['src/servidor.ts'], {
    env: { ...process.env, PORT: String(puerto), LOG_LEVEL: 'info' },
  });
  await once(servidor.stdout!, 'data'); // la línea «La tienda escucha en…»
});

after(() => servidor.kill());

test('WebSocket: el servidor responde 101 Switching Protocols y cambia de protocolo', async () => {
  const peticion = request({
    host: '127.0.0.1',
    port: puerto,
    path: '/eco',
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    },
  });
  peticion.end();
  const [respuesta, socket] = await once(peticion, 'upgrade');
  assert.equal(respuesta.statusCode, 101);
  assert.equal(respuesta.headers.upgrade, 'websocket');
  // La respuesta que manda la RFC 6455 para esa clave de ejemplo.
  assert.equal(respuesta.headers['sec-websocket-accept'], 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  socket.destroy();
});

test('WebSocket: el eco saluda y devuelve cada mensaje', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${puerto}/eco`);
  const saludo = once(ws, 'message');
  await once(ws, 'open');
  const [primero] = (await saludo) as [MessageEvent];
  assert.equal(primero.data, 'Hola. Escribe algo y te lo devuelvo.');
  ws.send('hola');
  const [eco] = (await once(ws, 'message')) as [MessageEvent];
  assert.equal(eco.data, 'eco: hola');
  ws.close();
});
