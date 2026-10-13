import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { orderChanges } from '../src/data.ts';
import { sign } from '../src/signature.ts';

type Reader = ReadableStreamDefaultReader<string>;

/** Opens an order's event stream. */
async function follow(id: number): Promise<{ res: Response; reader: Reader }> {
  const res = await app.request(`/v2/orders/${id}/events`);
  return { res, reader: res.body!.pipeThrough(new TextDecoderStream()).getReader() };
}

/** Reads up to the end of the next event (a blank line) and returns its name and its data. */
async function nextEvent(reader: Reader): Promise<{ event: string; data: unknown }> {
  let text = '';
  while (!text.includes('\n\n')) {
    const { value, done } = await reader.read();
    if (done) throw new Error('The stream has closed');
    text += value;
  }
  const event = text.match(/^event: (.*)$/m)![1]!;
  const data = JSON.parse(text.match(/^data: (.*)$/m)![1]!);
  return { event, data };
}

const cancel = (id: number) => app.request(`/v2/orders/${id}/cancellation`, { method: 'POST' });

test('SSE: text/event-stream, and first of all, the current status', async () => {
  const { res, reader } = await follow(25);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const first = await nextEvent(reader);
  assert.equal(first.event, 'status');
  assert.deepEqual(first.data, {
    id: 25,
    productId: 2,
    quantity: 2,
    status: 'pending',
    createdAt: '2026-10-08T09:00:00.000Z',
  });
  await reader.cancel();
});

test("SSE: each change to that order arrives over the same response; other orders' do not", async () => {
  const { reader } = await follow(24);
  await nextEvent(reader);
  await cancel(23); // another order: it must not arrive
  const body = JSON.stringify({ id: 'evt_sse', type: 'payment.completed', orderId: 24 });
  await app.request('/v2/webhooks/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(body, config.WEBHOOK_SECRET),
    },
    body,
  });
  const paid = await nextEvent(reader);
  assert.equal((paid.data as { id: number }).id, 24);
  assert.equal((paid.data as { status: string }).status, 'paid');
  await cancel(24);
  assert.equal(((await nextEvent(reader)).data as { status: string }).status, 'cancelled');
  await reader.cancel();
});

test('SSE: when the client leaves, the server stops listening to the changes', async () => {
  const initial = orderChanges.listenerCount('change');
  const { reader } = await follow(22);
  await nextEvent(reader);
  assert.equal(orderChanges.listenerCount('change'), initial + 1);
  await reader.cancel();
  await new Promise((ready) => setImmediate(ready));
  assert.equal(orderChanges.listenerCount('change'), initial);
});

test('SSE for an order that does not exist: 404, like any other error', async () => {
  const res = await app.request('/v2/orders/999/events');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
});

test('/echo without asking for WebSocket: 426 Upgrade Required', async () => {
  const res = await app.request('/echo');
  assert.equal(res.status, 426);
  assert.equal(res.headers.get('upgrade'), 'websocket');
  assert.equal((await res.json()).title, 'Upgrade Required');
});

// WebSocket needs a real server: src/server.ts is started on a free port.
let server: ChildProcess;
let port: number;

before(async () => {
  const free = createServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  port = (free.address() as { port: number }).port;
  free.close();
  server = spawn('node', ['src/server.ts'], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'info' },
  });
  await once(server.stdout!, 'data'); // the "The shop is listening on…" line
});

after(() => server.kill());

test('WebSocket: the server answers 101 Switching Protocols and switches protocol', async () => {
  const req = request({
    host: '127.0.0.1',
    port,
    path: '/echo',
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    },
  });
  req.end();
  const [response, socket] = await once(req, 'upgrade');
  assert.equal(response.statusCode, 101);
  assert.equal(response.headers.upgrade, 'websocket');
  // The answer RFC 6455 gives for that sample key.
  assert.equal(response.headers['sec-websocket-accept'], 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  socket.destroy();
});

test('WebSocket: the echo says hi and sends back each message', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/echo`);
  const greeting = once(ws, 'message');
  await once(ws, 'open');
  const [first] = (await greeting) as [MessageEvent];
  assert.equal(first.data, "Hi. Type something and I'll send it back.");
  ws.send('hello');
  const [echo] = (await once(ws, 'message')) as [MessageEvent];
  assert.equal(echo.data, 'echo: hello');
  ws.close();
});
