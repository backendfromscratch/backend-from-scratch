// The traces (Phase 10, lesson 4): src/instrumentation.ts starts OpenTelemetry, and each request and
// each job leave their spans. Here, instead of sending them to Jaeger, they stay in the test's
// memory (InMemorySpanExporter), to look at them.
// The order matters: the instrumentation has to start BEFORE pg, redis, BullMQ or pino are loaded,
// because it changes them when they are loaded. That is why this file imports nothing of the shop at
// the top, unlike the others: it starts the instrumentation and, afterwards, imports it with
// import(). In the real shop node --import ./src/instrumentation.ts does the same.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { SpanKind, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  commandWithoutData,
  startInstrumentation,
  urlWithoutQuery,
} from '../src/instrumentation.ts';

const exporter = new InMemorySpanExporter();
const instrumentation = startInstrumentation({ exporter });

// With Redis (REDIS_URL_TESTS), this file's shop uses it as in Compose: the attempt limits go to
// Redis, and that way you see what its spans write down. It has to come before importing config.ts,
// which reads the variables when it loads.
if (process.env.REDIS_URL_TESTS) process.env.REDIS_URL = process.env.REDIS_URL_TESTS;

// Now yes, the shop. Also node:http: safe-url.ts imports it to send the notices, and the http
// instrumentation only sees the imports that come after it starts.
const { createServer } = await import('node:http');
const { serve } = await import('@hono/node-server');
const { app } = await import('../src/app.ts');
const { connectRedis } = await import('../src/redis-store.ts');
const { closeQueue, createQueue, createWorker, enqueue, runJob } = await import('../src/queue.ts');
const { createKey } = await import('../src/api-keys.ts');
const { findOrder } = await import('../src/data.ts');
const { orderChanges } = await import('../src/order-events.ts');
const { closeLimits } = await import('../src/rate-limits.ts');
const { config } = await import('../src/config.ts');
const { sign } = await import('../src/signature.ts');
const { relay } = await import('../src/outbox.ts');
const { pool } = await import('../src/db.ts');
const { useDb } = await import('./db.ts');

useDb();

const url = process.env.REDIS_URL_TESTS;
const withoutRedis = url
  ? false
  : 'without Redis: set REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to test it';

// The real API, on a free port: that way the request goes through node:http, as in production, and
// you can see whether the http instrumentation adds another server span.
let shop: string;
let server: ReturnType<typeof serve>;
before(async () => {
  server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  await once(server, 'listening');
  shop = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  // The Redis connections the shop opens with REDIS_URL, as when shutting down (server.ts).
  await closeQueue();
  await orderChanges.close();
  await closeLimits();
  await instrumentation.shutdown();
});

const spans = () => exporter.getFinishedSpans();
const ofTrace = (traceId: string) => spans().filter((s) => s.spanContext().traceId === traceId);

/** The server spans: one for each request the API has received. */
const serverSpans = () => spans().filter((s) => s.kind === SpanKind.SERVER);

/** Waits until the condition is met, or fails when the time is up. */
async function waitFor(condition: () => boolean | Promise<boolean>, ms = 10_000, what = '') {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) assert.fail(`after ${ms} ms, still not: ${what}`);
    await sleep(50);
  }
}

test('a request leaves a server span, with the route and the requestId, and one for each query', async () => {
  exporter.reset();
  const res = await fetch(`${shop}/v2/products`);
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  await waitFor(() => serverSpans().length > 0, 5000, "the request's span");

  // Just one: Hono's (@hono/otel). The http instrumentation doesn't add its own.
  const [request, ...others] = serverSpans();
  assert.equal(others.length, 0, 'a single server span');
  // With the route's template, not the URL: GET /v2/orders/:id, never GET /v2/orders/7.
  assert.equal(request!.name, 'GET /v2/products');
  assert.equal(request!.attributes['http.route'], '/v2/products');
  // The id the caller sees (the X-Request-Id header) finds the trace.
  assert.equal(request!.attributes['shop.request_id'], res.headers.get('x-request-id'));

  // And its queries to PostgreSQL, inside: child spans of the request's.
  const traceId = request!.spanContext().traceId;
  const queries = ofTrace(traceId).filter((s) => s.attributes['db.system.name'] === 'postgresql');
  assert.ok(queries.length >= 1, 'at least one query');
  assert.ok(
    queries.some((s) => s.parentSpanContext?.spanId === request!.spanContext().spanId),
    "a query, a direct child of the request's",
  );
});

test('a route with a parameter: the span carries the template, not the id', async () => {
  exporter.reset();
  const res = await fetch(`${shop}/v2/products/1`);
  await res.arrayBuffer();
  await waitFor(() => serverSpans().length > 0, 5000, "the request's span");
  assert.equal(serverSpans()[0]!.name, 'GET /v2/products/:id');
});

/** The payment gateway says the order is paid (scripts/payment-gateway.ts). */
async function pay(orderId: number) {
  const body = JSON.stringify({ id: `evt_trace_${orderId}`, type: 'payment.completed', orderId });
  return fetch(`${shop}/v2/webhooks/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(body, config.WEBHOOK_SECRET),
    },
    body,
  });
}

test(
  'from the payment to the worker, a single trace: it goes through outbox_events and the queue',
  { skip: withoutRedis },
  async () => {
    const connection = connectRedis(url!);
    const queue = createQueue(connection);
    await queue.obliterate({ force: true });
    await pool.query('DELETE FROM notifications');
    exporter.reset();
    const worker = createWorker({ url: url! });
    try {
      // Order 21, pending, is Carmen's. With no notifications saved: a single job, the email.
      const res = await pay(21);
      assert.equal(res.status, 200);
      await res.arrayBuffer();
      await waitFor(() => serverSpans().length > 0, 5000, "the payment's span");
      const payment = serverSpans()[0]!;
      assert.equal(payment.name, 'POST /v2/webhooks/payments');
      const traceId = payment.spanContext().traceId;

      // The outgoing event saves the trace it was created in (W3C traceparent): version, trace,
      // span and options (01: it is kept).
      const { rows } = await pool.query<{ context: string | null }>(
        'SELECT context FROM outbox_events',
      );
      assert.equal(rows.length, 1);
      assert.match(rows[0]!.context ?? '', new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));

      // The relayer (in the worker, with no request) puts it in the queue, in that same trace.
      assert.equal(await relay(50, (job) => enqueue(job, queue)), 1);
      await waitFor(
        () => ofTrace(traceId).some((s) => s.kind === SpanKind.CONSUMER),
        10_000,
        "the worker's span, in the payment's trace",
      );
      const inTheTrace = ofTrace(traceId);
      const producer = inTheTrace.find((s) => s.kind === SpanKind.PRODUCER);
      assert.equal(producer?.name, 'add shop.confirmation-email');
      const consumer = inTheTrace.find((s) => s.kind === SpanKind.CONSUMER);
      assert.equal(consumer?.name, 'process shop');
      assert.equal(consumer?.parentSpanContext?.spanId, producer?.spanContext().spanId);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      connection.destroy();
    }
  },
);

test(
  'an event saved without a trace (from before this step) is relayed all the same',
  { skip: withoutRedis },
  async () => {
    const connection = connectRedis(url!);
    const queue = createQueue(connection);
    try {
      await queue.obliterate({ force: true });
      await pool.query('DELETE FROM outbox_events');
      await pool.query(`INSERT INTO outbox_events (type, data) VALUES ('confirmation-email', $1)`, [
        { type: 'confirmation-email', order: { id: 22 } },
      ]);
      // And one with a context that isn't a traceparent: it doesn't fail either, it starts its own trace.
      await pool.query(
        `INSERT INTO outbox_events (type, data, context)
           VALUES ('confirmation-email', $1, 'not-a-traceparent')`,
        [{ type: 'confirmation-email', order: { id: 24 } }],
      );
      assert.equal(await relay(50, (job) => enqueue(job, queue)), 2);
      assert.equal(await queue.count(), 2);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      connection.destroy();
    }
  },
);

// A trace must not carry what the log doesn't: what a span writes down leaves the shop.

/**
 * All the values written down by a request's span and those that hang from it: its attributes and
 * those of its events. Without the span of this test's fetch, which is the client: in the trace it
 * is above the request, and in production it isn't the shop's.
 */
function valuesOf(request: ReadableSpan): string[] {
  const theShops = new Set([request.spanContext().spanId]);
  const all = ofTrace(request.spanContext().traceId);
  // The children, the children's children…: until no more are added.
  for (let before = 0; before !== theShops.size;) {
    before = theShops.size;
    for (const span of all) {
      if (theShops.has(span.parentSpanContext?.spanId ?? '')) {
        theShops.add(span.spanContext().spanId);
      }
    }
  }
  return all
    .filter((span) => theShops.has(span.spanContext().spanId))
    .flatMap((span) =>
      [span.attributes, ...span.events.map((event) => event.attributes ?? {})].flatMap(
        (attributes) => Object.values(attributes).map(String),
      ),
    );
}

test('the return from the provider: neither the code nor the state reach the trace', async () => {
  exporter.reset();
  const res = await fetch(
    `${shop}/v2/session/provider/callback?code=secret-code-123&state=secret-state-456`,
  );
  await res.arrayBuffer();
  await waitFor(() => serverSpans().length > 0, 5000, "the return's span");
  const callback = serverSpans()[0]!;
  assert.equal(callback.name, 'GET /v2/session/provider/callback');
  // The URL, without the query.
  assert.equal(callback.attributes['url.full'], `${shop}/v2/session/provider/callback`);
  for (const value of valuesOf(callback)) {
    assert.doesNotMatch(value, /secret-code|secret-state/);
  }
  // And the span of this test's fetch, the client (undici instrumentation): also without the query.
  const client = ofTrace(callback.spanContext().traceId).find(
    (s) => s.instrumentationScope.name === '@opentelemetry/instrumentation-undici',
  );
  assert.equal(client?.attributes['url.full'], `${shop}/v2/session/provider/callback`);
});

test('a notice to the delivery company: its span (node:http) carries the URL without the query', async () => {
  // A notice receiver on 127.0.0.1, with a token in its URL's query, like one a delivery company
  // might give.
  const receiver = createServer((_request, response) => void response.writeHead(204).end());
  receiver.listen(0, '127.0.0.1');
  await once(receiver, 'listening');
  const noticesUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/notices`;
  const { id } = await createKey('Test delivery');
  await pool.query(`INSERT INTO notifications (key_id, url, secret) VALUES ($1, $2, 'secret')`, [
    id,
    `${noticesUrl}?token=delivery-token`,
  ]);
  try {
    exporter.reset();
    // The notice's job, as the worker does it, inside a span that stands in for its trace.
    await trace.getTracer('test').startActiveSpan('test notice', async (span) => {
      await runJob(
        {
          type: 'payment-notice',
          notificationId: id,
          order: (await findOrder(13))!,
          eventId: 'e1',
        },
        { devHosts: ['127.0.0.1'] },
      );
      span.end();
    });
    const notice = spans().find(
      (s) => s.instrumentationScope.name === '@opentelemetry/instrumentation-http',
    );
    assert.equal(notice?.kind, SpanKind.CLIENT);
    assert.equal(notice?.attributes['url.full'], noticesUrl);
    for (const value of valuesOf(notice!)) assert.doesNotMatch(value, /delivery-token/);
  } finally {
    receiver.close();
    await pool.query('DELETE FROM notifications');
  }
});

test(
  'a sign-in: neither the email nor the IP reach the Redis spans',
  { skip: withoutRedis },
  async () => {
    const client = connectRedis(url!);
    try {
      exporter.reset();
      // A wrong password: both limits (by email and by IP) write the failure down in Redis.
      const res = await fetch(`${shop}/v2/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'Trace.Secret@example.com', password: 'not-the-right-one' }),
      });
      assert.equal(res.status, 400);
      await res.arrayBuffer();
      await waitFor(() => serverSpans().length > 0, 5000, "the sign-in's span");
      const request = serverSpans()[0]!;
      const traceId = request.spanContext().traceId;
      // There are Redis spans (otherwise, the test would prove nothing), and they only say the
      // command and what the key is for: "ZADD limits:?", without the rest
      // (limits:session-email:trace.secret@example.com).
      const ofRedis = ofTrace(traceId).filter((s) => s.attributes['db.system.name'] === 'redis');
      // Two failures written down: one for the email and one for the IP.
      assert.equal(
        ofRedis.filter((s) => s.attributes['db.query.text'] === 'ZADD limits:?').length,
        2,
      );
      for (const span of ofRedis) {
        assert.match(String(span.attributes['db.query.text']), /^[A-Z]+( [\w-]+:\?)?$/);
      }
      for (const value of valuesOf(request)) assert.doesNotMatch(value, /trace\.secret/i);
    } finally {
      // The attempts written down, out: they don't count for other tests.
      const keys = await client.keys('limits:session-*');
      if (keys.length > 0) await client.del(keys);
      client.destroy();
    }
  },
);

test('urlWithoutQuery: the URL without the query or the fragment', () => {
  assert.equal(
    urlWithoutQuery('https://shop.example/v2/x?code=1&state=2#a'),
    'https://shop.example/v2/x',
  );
  assert.equal(urlWithoutQuery('http://127.0.0.1:3000/health'), 'http://127.0.0.1:3000/health');
  // One that isn't a whole URL: what's before the ?, at least.
  assert.equal(urlWithoutQuery('/v2/x?code=1'), '/v2/x');
});

test('commandWithoutData: the command and what the key is for, without the key', () => {
  assert.equal(
    commandWithoutData('ZADD', ['limits:session-email:ana@example.com', '1', '1']),
    'ZADD limits:?',
  );
  assert.equal(commandWithoutData('GET', ['limits:session-ip:2001:db8::1']), 'GET limits:?');
  assert.equal(commandWithoutData('PUBLISH', [Buffer.from('shop:orders'), '{}']), 'PUBLISH shop:?');
  // With no colon you can't tell what it is: only the command.
  assert.equal(commandWithoutData('EVALSHA', ['5f3a9c…', '2']), 'EVALSHA');
  assert.equal(commandWithoutData('PING', []), 'PING');
});

const execute = promisify(execFile);

/** The tests' environment without any OpenTelemetry variable. */
function withoutOtel(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('OTEL_')),
  );
}

// What each process prints at the end: who provides the spans. Without the SDK, the "do nothing"
// one from OpenTelemetry's API (NoopTracerProvider).
const PROVIDER = `import { trace } from '@opentelemetry/api';
import { instrumentation } from './src/instrumentation.ts';
trace.getTracer('test').startSpan('a-test').end();
await instrumentation.shutdown();
console.log(trace.getTracerProvider().getDelegate().constructor.name);`;

test('without OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, nothing starts and nothing is written to stderr', async () => {
  const { stdout, stderr } = await execute(
    'node',
    ['--import', './src/instrumentation.ts', '--input-type=module', '-e', PROVIDER],
    { env: withoutOtel() },
  );
  assert.equal(stdout, 'NoopTracerProvider\n');
  assert.equal(stderr, '');
});

test('with OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, it sends the spans there, with no warnings on stderr', async () => {
  // A fake Jaeger: it writes down what reaches it.
  const received: { url: string | undefined; type: string | undefined; body: Buffer }[] = [];
  const receiver = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    received.push({
      url: request.url,
      type: request.headers['content-type'],
      body: Buffer.concat(chunks),
    });
    response.writeHead(200).end();
  });
  receiver.listen(0, '127.0.0.1');
  await once(receiver, 'listening');
  try {
    const { port } = receiver.address() as AddressInfo;
    const { stdout, stderr } = await execute(
      'node',
      ['--import', './src/instrumentation.ts', '--input-type=module', '-e', PROVIDER],
      {
        env: {
          ...withoutOtel(),
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${port}/v1/traces`,
          OTEL_SERVICE_NAME: 'shop-test',
        },
      },
    );
    assert.notEqual(stdout, 'NoopTracerProvider\n');
    // Not even the DEP0205 warning from module.register(): module.registerHooks() is used.
    assert.equal(stderr, '');
    // shutdown() has sent what was left: the span, in protobuf, to the URL as is.
    assert.equal(received.length, 1);
    assert.equal(received[0]!.url, '/v1/traces');
    assert.equal(received[0]!.type, 'application/x-protobuf');
    assert.ok(received[0]!.body.includes('a-test'));
    assert.ok(received[0]!.body.includes('shop-test'));
  } finally {
    receiver.close();
  }
});
