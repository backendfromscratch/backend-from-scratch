// The metrics (Phase 10, lesson 5): src/metrics.ts counts what matters to the shop (paid orders,
// responses outside the contract, jobs waiting) and @hono/otel measures each request.
// Here, instead of sending them to Prometheus, they stay in the test's memory: a reader that
// collects them when asked (collect), as Prometheus does when it receives them.
// As in instrumentation.test.ts, the instrumentation starts first and then the shop is imported
// (and node:http, and whatever you want to measure), with import().
import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { startInstrumentation } from '../src/instrumentation.ts';

// A huge exportIntervalMillis: it sends nothing on its own, only when the test calls collect().
const reader = new PeriodicExportingMetricReader({
  exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
  exportIntervalMillis: 3_600_000,
});
const instrumentation = startInstrumentation({ metricReader: reader });

if (process.env.REDIS_URL_TESTS) process.env.REDIS_URL = process.env.REDIS_URL_TESTS;

const { OpenAPIHono, createRoute, z } = await import('@hono/zod-openapi');
const { requestId } = await import('hono/request-id');
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { sign } = await import('../src/signature.ts');
const { changeStatus } = await import('../src/data.ts');
const { connectRedis } = await import('../src/redis-store.ts');
const { createQueue } = await import('../src/queue.ts');
const { validateResponses } = await import('../src/contract-responses.ts');
const { metrics, observeQueue } = await import('../src/metrics.ts');
const { closeQueue } = await import('../src/queue.ts');
const { orderChanges } = await import('../src/order-events.ts');
const { closeLimits } = await import('../src/rate-limits.ts');
const { useDb } = await import('./db.ts');

// The Redis connections the shop opens with REDIS_URL, as when shutting down (server.ts).
after(async () => {
  await closeQueue();
  await orderChanges.close();
  await closeLimits();
  await instrumentation.shutdown();
});
const { CARMEN, asUser } = await import('./identities.ts');

let carmen: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
});

type Point = { attributes: Record<string, unknown>; value: number };

/** A metric's points, now: one for each combination of attributes. */
async function points(name: string): Promise<Point[]> {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((m) => m.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((point) => ({
    attributes: point.attributes as Record<string, unknown>,
    // The histogram doesn't have a value, but a count of measurements.
    value: typeof point.value === 'number' ? point.value : (point.value as { count: number }).count,
  }));
}
const total = async (name: string) =>
  (await points(name)).reduce((sum, point) => sum + point.value, 0);

async function newOrder(): Promise<number> {
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"productId":1,"quantity":1}',
  });
  return (await res.json()).id;
}

const pay = (id: string, orderId: number) => {
  const body = JSON.stringify({ id, type: 'payment.completed', orderId });
  return app.request('/v2/webhooks/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(body, config.WEBHOOK_SECRET),
    },
    body,
  });
};

test('paying an order adds 1 to shop.orders.paid', async () => {
  const before = await total('shop.orders.paid');
  const order = await newOrder();
  assert.equal((await pay('evt_metrics_1', order)).status, 200);
  assert.equal((await total('shop.orders.paid')) - before, 1);
});

test('the same event again adds nothing', async () => {
  const order = await newOrder();
  await pay('evt_metrics_2', order);
  const before = await total('shop.orders.paid');
  const repeated = await pay('evt_metrics_2', order);
  assert.equal(((await repeated.json()) as { repeated: boolean }).repeated, true);
  assert.equal((await total('shop.orders.paid')) - before, 0);
});

test('a payment for a cancelled order (the status does not change) adds nothing', async () => {
  const order = await newOrder();
  assert.ok(await changeStatus(order, 'cancelled', 'pending'));
  const before = await total('shop.orders.paid');
  assert.equal((await pay('evt_metrics_3', order)).status, 200);
  assert.equal((await total('shop.orders.paid')) - before, 0);
});

test("a request is measured by the route's template, not by the URL", async () => {
  const res = await app.request('/v2/products/1');
  await res.arrayBuffer();
  const routes = (await points('http.server.request.duration')).map(
    (p) => p.attributes['http.route'],
  );
  assert.ok(routes.includes('/v2/products/:id'), `routes measured: ${routes.join(', ')}`);
  assert.ok(!routes.includes('/v2/products/1'));
  // The 5xx errors panel filters by this attribute: if @hono/otel renamed it, the panel would
  // be left empty without warning, and here it fails.
  const statuses = (await points('http.server.request.duration')).map(
    (p) => p.attributes['http.response.status_code'],
  );
  assert.ok(statuses.includes(200), `statuses measured: ${statuses.join(', ')}`);
});

// An API with a route that breaks its contract on purpose (as in contract.test.ts).
function brokenApi() {
  const broken = new OpenAPIHono();
  broken.use(requestId());
  broken.use(
    validateResponses('log', {
      prefix: '',
      document: () =>
        broken.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'broken', version: '1' } }),
    }),
  );
  broken.openapi(
    createRoute({
      method: 'get',
      path: '/things/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: 'The thing',
          content: { 'application/json': { schema: z.object({ name: z.string() }) } },
        },
      },
    }),
    (c) => c.json({ title: 'x' } as never, 200),
  );
  return broken;
}

test("a response outside the contract adds 1, with the route's template as the route", async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    const before = await total('shop.responses.outside_contract');
    await brokenApi().request('/things/7');
    await brokenApi().request('/things/8');
    const after = await points('shop.responses.outside_contract');
    assert.equal(after.reduce((s, p) => s + p.value, 0) - before, 2);
    // Both, under a single route: the template, not /things/7 or /things/8.
    assert.deepEqual(
      after.map((p) => p.attributes.route),
      ['/things/{id}'],
    );
  } finally {
    warning.mock.restore();
  }
});

test('a response that meets the contract adds nothing', async () => {
  const before = await total('shop.responses.outside_contract');
  await app.request('/v2/products');
  assert.equal((await total('shop.responses.outside_contract')) - before, 0);
});

test('metrics has the two counters', () => {
  assert.equal(typeof metrics.ordersPaid.add, 'function');
  assert.equal(typeof metrics.responsesOutsideContract.add, 'function');
});

test('shop.queue.waiting: with no Redis that answers, it reports no value', async () => {
  const unanswering = { getWaitingCount: () => Promise.reject(new Error("Redis doesn't answer")) };
  const stopObserving = observeQueue(unanswering, { waitMs: 200 });
  try {
    assert.deepEqual(await points('shop.queue.waiting'), []);
  } finally {
    stopObserving();
  }
});

test('shop.queue.waiting: with no Redis that answers in time, neither', async () => {
  const slow = { getWaitingCount: () => new Promise<number>(() => {}) };
  const stopObserving = observeQueue(slow, { waitMs: 100 });
  try {
    assert.deepEqual(await points('shop.queue.waiting'), []);
  } finally {
    stopObserving();
  }
});

test('shop.queue.waiting: with a read that has not finished, another does not start', async () => {
  let reads = 0;
  const frozen = {
    getWaitingCount: () => {
      reads++;
      return new Promise<number>(() => {});
    },
  };
  const stopObserving = observeQueue(frozen, { waitMs: 50 });
  try {
    for (let i = 0; i < 3; i++) await points('shop.queue.waiting');
    assert.equal(reads, 1);
  } finally {
    stopObserving();
  }
});

test(
  'shop.queue.waiting: it counts the jobs waiting in the queue',
  { skip: process.env.REDIS_URL_TESTS ? false : 'without Redis: set REDIS_URL_TESTS in test/.env' },
  async () => {
    const connection = connectRedis(process.env.REDIS_URL_TESTS!);
    const queue = createQueue(connection);
    const stopObserving = observeQueue(queue);
    try {
      await queue.obliterate({ force: true });
      assert.equal(await total('shop.queue.waiting'), 0);
      // With no worker, nobody takes them: they stay waiting.
      await queue.add('confirmation-email', { type: 'confirmation-email' } as never);
      await queue.add('confirmation-email', { type: 'confirmation-email' } as never, {
        jobId: 'another',
      });
      assert.equal(await total('shop.queue.waiting'), 2);
    } finally {
      stopObserving();
      await queue.obliterate({ force: true });
      await queue.close();
      connection.destroy();
    }
  },
);
