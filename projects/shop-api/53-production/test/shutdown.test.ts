// The API's shutdown (Phase 9, lesson 4), src/shutdown.ts: it stops accepting connections, finishes
// the requests it has half done, closes the event streams and the WebSockets, and then the database
// and Redis, all of it within a limit. The first tests use a test HTTP server in this same process;
// the last one starts the real API (src/server.ts) and sends it SIGTERM, like docker stop.
// shuttingDown() has no way back: as soon as a test calls shutDown, this process is shutting down
// for the rest of the file. That's why the /health one goes first.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type RequestListener, type Server } from 'node:http';
import { type AddressInfo, connect, createServer as createTcpServer } from 'node:net';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { app } from '../src/app.ts';
import { shutDown, shuttingDown } from '../src/shutdown.ts';
import { useDb } from './db.ts';
import { ANA, asUser } from './identities.ts';

// Ana, admin: she can follow any order.
let ana: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
});

/** An HTTP server on a free port of 127.0.0.1, which answers with that function. */
async function testServer(handle: RequestListener) {
  const server: Server = createServer(handle);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return { server, port, url: `http://127.0.0.1:${port}` };
}

/** A promise that is fulfilled when arrive() is called: to know the request is already inside. */
function notice() {
  let arrive!: () => void;
  const arrival = new Promise<void>((resolve) => (arrive = resolve));
  return { arrive, arrival };
}

test('on shutdown, /health answers 503', { timeout: 15_000 }, async () => {
  assert.equal(shuttingDown(), false);
  assert.equal((await app.request('/health')).status, 200);
  const { server } = await testServer((_request, response) => response.end());
  await shutDown(server, [], 1000);
  assert.equal(shuttingDown(), true);
  // The database still answers, but this copy is leaving: Docker and deploy.sh read it that way.
  const res = await app.request('/health');
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).detail, 'The shop is shutting down');
  // The two from Phase 10, lesson 6, the same: this copy is neither much alive nor ready.
  assert.equal((await app.request('/health/live')).status, 503);
  const ready = await app.request('/health/ready');
  assert.equal(ready.status, 503);
  // No checks: it doesn't ask anybody.
  assert.deepEqual(await ready.json(), { status: 'shutting-down' });
});

test('it stops accepting new connections', { timeout: 15_000 }, async () => {
  const { server, port, url } = await testServer((_request, response) => response.end('ok'));
  // fetch leaves the connection open for the next request (keep-alive): shutting down closes it,
  // without waiting for the client to let go.
  assert.equal((await fetch(url)).status, 200);
  const before = Date.now();
  await shutDown(server, [], 5000);
  assert.ok(
    Date.now() - before < 1000,
    'without waiting for the connection that was doing nothing',
  );
  const error = await new Promise<NodeJS.ErrnoException | undefined>((resolve) => {
    const connection = connect(port, '127.0.0.1');
    connection.on('error', resolve);
    connection.on('connect', () => {
      connection.destroy();
      resolve(undefined);
    });
  });
  // Refused: the port no longer listens. nginx, with the connection refused, moves on to the other
  // copy, even if it's a POST, as long as Docker doesn't put docker-proxy in front (README): the
  // proxy would accept it and cut it afterwards, and nginx doesn't repeat a POST it already sent.
  assert.equal(error?.code, 'ECONNREFUSED');
});

test(
  'it waits for the request that is half done and finishes it',
  { timeout: 15_000 },
  async () => {
    const { arrive, arrival } = notice();
    const { server, url } = await testServer(async (_request, response) => {
      arrive();
      await sleep(300);
      response.end('order saved');
    });
    // A POST, like paying an order: if it were cut in half, nginx wouldn't repeat it (Phase 8).
    const request = fetch(url, { method: 'POST', body: '{}' }).then(async (res) => ({
      status: res.status,
      body: await res.text(),
    }));
    await arrival;
    const before = Date.now();
    await shutDown(server, [], 5000);
    const took = Date.now() - before;
    assert.deepEqual(await request, { status: 200, body: 'order saved' });
    assert.ok(took >= 250, `it waited for the request (${took} ms)`);
    // And nothing more: fetch's keep-alive connection closes as soon as the response has gone out.
    assert.ok(took < 1500, `without waiting for the limit (${took} ms)`);
  },
);

test(
  'what arrives over an open connection while shutting down goes out with Connection: close',
  { timeout: 15_000 },
  async () => {
    const { arrive, arrival } = notice();
    // The first request takes long; the second one is answered at once, without waiting for anything.
    const { server, port } = await testServer(async (request, response) => {
      if (request.url === '/slow') {
        arrive();
        await sleep(200);
      }
      response.end('ok');
    });
    // A slow request, and over the same connection, when it is already shutting down, another one
    // (HTTP/1.1 lets the next one be sent without waiting for the response).
    const connection = connect(port, '127.0.0.1');
    let received = '';
    connection.on('data', (chunk) => (received += chunk));
    connection.write('GET /slow HTTP/1.1\r\nHost: x\r\n\r\n');
    await arrival;
    const shutDownDone = shutDown(server, [], 5000);
    connection.write('GET /fast HTTP/1.1\r\nHost: x\r\n\r\n');
    await shutDownDone;
    if (!connection.closed) await once(connection, 'close');
    // Both answered; the second one, warning that the connection closes.
    const responses = received.split('HTTP/1.1 ').filter(Boolean);
    assert.equal(responses.length, 2, received);
    assert.match(responses[0]!, /^200 /);
    assert.match(responses[1]!, /^200 [^]*\r\nConnection: close\r\n/i);
  },
);

test('it closes the database and Redis after the requests', { timeout: 15_000 }, async () => {
  const events: string[] = [];
  const { arrive, arrival } = notice();
  const { server, url } = await testServer(async (_request, response) => {
    arrive();
    await sleep(200);
    events.push('response');
    response.end();
  });
  /** A fake resource, which writes down when it starts closing and when it has finished. */
  const resource = (name: string, fails = false) => ({
    async close() {
      events.push(`${name}: starts`);
      await sleep(20);
      if (fails) throw new Error(`${name} does not close`);
      events.push(`${name}: closed`);
    },
  });
  const request = fetch(url).then((res) => res.text());
  await arrival;
  // The queue fails to close: the ones behind it close anyway.
  await shutDown(
    server,
    [resource('db'), resource('queue', true), resource('notices'), resource('cache')],
    5000,
  );
  await request;
  // One after another, in that order, and none before the request has finished.
  assert.deepEqual(events, [
    'response',
    'db: starts',
    'db: closed',
    'queue: starts',
    'notices: starts',
    'notices: closed',
    'cache: starts',
    'cache: closed',
  ]);
});

test('it waits no longer than the limit', { timeout: 15_000 }, async () => {
  const { arrive, arrival } = notice();
  // A request that never ends.
  const { server, url } = await testServer(() => arrive());
  const request = fetch(url).then(
    () => 'answered',
    () => 'cut',
  );
  await arrival;
  // And a resource that never finishes closing (a hung Redis that doesn't answer).
  const called: string[] = [];
  const resources = [
    { close: () => new Promise<void>(() => called.push('hung')) },
    { close: async () => void called.push('next') },
  ];
  const before = Date.now();
  await shutDown(server, resources, 300);
  const took = Date.now() - before;
  assert.ok(took >= 290 && took < 800, `${took} ms`);
  // Past the limit, the request is cut, and every resource is asked to close.
  assert.equal(await request, 'cut');
  assert.deepEqual(called, ['hung', 'next']);
});

/** A free port on 127.0.0.1. */
async function freePort(): Promise<number> {
  const free = createTcpServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as AddressInfo).port;
  free.close();
  await once(free, 'close');
  return port;
}

/** The real API (src/server.ts) on a free port, without Redis; it returns when it is listening. */
async function startApi() {
  const port = await freePort();
  const { REDIS_URL: _r, SMTP_URL: _s, CACHE_URL: _c, ...base } = process.env;
  const child: ChildProcessWithoutNullStreams = spawn('node', ['src/server.ts'], {
    env: { ...base, LOG_LEVEL: 'info', PORT: String(port) },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const until = Date.now() + 10_000;
  while (!output.includes('The shop is listening')) {
    if (Date.now() > until) {
      child.kill();
      assert.fail(`the API doesn't start: ${output}`);
    }
    await sleep(20);
  }
  return { child, output: () => output, port };
}

test(
  'on shutdown, it closes the event streams and the WebSockets',
  { timeout: 15_000 },
  async () => {
    const api = await startApi();
    try {
      // Ana follows order 7 (Server-Sent Events): the response starts and doesn't end.
      const res = await fetch(`http://127.0.0.1:${api.port}/v2/orders/7/events`, {
        headers: ana,
      });
      assert.equal(res.status, 200);
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      assert.match((await reader.read()).value!, /event: status/);
      // And somebody talks to the echo over WebSocket: another connection that doesn't end.
      const ws = new WebSocket(`ws://127.0.0.1:${api.port}/echo`);
      const greeting = once(ws, 'message');
      await once(ws, 'open');
      await greeting;
      const closing = once(ws, 'close');

      const before = Date.now();
      api.child.kill('SIGTERM');
      // The stream ends well (done), not cut: EventSource would connect again, to the other copy.
      let read = await reader.read();
      while (!read.done) read = await reader.read();
      // The WebSocket closes with 1001, "going away": the client can connect again.
      const [event] = (await closing) as [CloseEvent];
      assert.equal(event.code, 1001);
      assert.equal(event.reason, 'The shop is shutting down');
      const [code] = await once(api.child, 'exit');
      assert.equal(code, 0, api.output());
      // Without waiting for the limit's 8 seconds: nothing was left half done.
      assert.ok(Date.now() - before < 3000, `${Date.now() - before} ms`);
      assert.match(api.output(), /SIGTERM: the shop is shutting down/);
    } finally {
      if (api.child.exitCode === null) {
        api.child.kill('SIGKILL');
        await once(api.child, 'exit');
      }
    }
  },
);
