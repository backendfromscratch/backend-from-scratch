// The assistant in the traces and the metrics (Phase 11, lesson 7). As in instrumentation.test.ts
// and metrics.test.ts, the instrumentation starts before the shop is imported, with a span exporter
// and a metric reader that stay in the test's memory. And the fake model, before too: the SDK reads
// ANTHROPIC_BASE_URL when it creates the client.
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { SpanKind } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { startInstrumentation } from '../src/instrumentation.ts';
import { asksForTools, startFakeModel, text, toolUseBlock } from './fake-model.ts';

const exporter = new InMemorySpanExporter();
const reader = new PeriodicExportingMetricReader({
  exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
  exportIntervalMillis: 3_600_000,
});
const instrumentation = startInstrumentation({ exporter, metricReader: reader });

const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => {
  model.reset();
  exporter.reset();
});

const { app } = await import('../src/app.ts');
const { useEmbedder } = await import('../src/embeddings.ts');
const { createMemoryStore, store } = await import('../src/rate-limits.ts');
const { useDb } = await import('./db.ts');
const { createFakeEmbedder } = await import('./fake-embedder.ts');
const { CARMEN, asUser } = await import('./identities.ts');

after(() => instrumentation.shutdown());
useEmbedder(createFakeEmbedder());
beforeEach(() => Object.assign(store, createMemoryStore()));

let carmen: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
});

const ask = (accept = 'application/json') =>
  app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...carmen },
    body: JSON.stringify({ messages: [{ role: 'user', text: 'Do you have mugs?' }] }),
  });

// #region metrics
type Point = { attributes: Record<string, unknown>; value: number; sum?: number };

/** A metric's points, now; of a histogram, the number of measurements and their sum. */
async function points(name: string): Promise<Point[]> {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((m) => m.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((point) => {
    const value = point.value as number | { count: number; sum: number };
    return typeof value === 'number'
      ? { attributes: point.attributes as Record<string, unknown>, value }
      : {
          attributes: point.attributes as Record<string, unknown>,
          value: value.count,
          sum: value.sum,
        };
  });
}

const ofKind = async (kind: string) =>
  (await points('shop.ai.tokens')).find((p) => p.attributes.kind === kind)?.value ?? 0;
const cost = async () =>
  (await points('shop.ai.cost_dollars')).reduce((sum, p) => sum + p.value, 0);
const firstTokenMeasurements = async () =>
  (await points('shop.ai.time_to_first_token')).reduce((sum, p) => sum + p.value, 0);

test('shop.ai.tokens and shop.ai.cost_dollars: every call adds its tokens, by model and kind, and its cost', async () => {
  const before = {
    input: await ofKind('input'),
    output: await ofKind('output'),
    read: await ofKind('cache_read'),
    write: await ofKind('cache_write'),
    cost: await cost(),
  };
  model.script(
    text('Yes, the Mug.', {
      usage: { input: 1000, output: 200, cacheRead: 2000, cacheWrite: 500 },
    }),
  );
  assert.equal((await ask()).status, 200);
  assert.equal((await ofKind('input')) - before.input, 1000);
  assert.equal((await ofKind('output')) - before.output, 200);
  assert.equal((await ofKind('cache_read')) - before.read, 2000);
  assert.equal((await ofKind('cache_write')) - before.write, 500);
  // $0.0002825, as in the log (assistant-cost.test.ts).
  assert.ok(Math.abs((await cost()) - before.cost - 0.0002825) < 1e-12);
  // The attributes: the model and the kind, never the customer (one series per customer would never end).
  for (const point of await points('shop.ai.tokens')) {
    assert.deepEqual(Object.keys(point.attributes).sort(), ['kind', 'model']);
    assert.equal(point.attributes.model, 'claude-haiku-5-5');
  }
});

test('shop.ai.time_to_first_token: one measurement per streamed answer, in seconds; in JSON, none', async () => {
  const before = await firstTokenMeasurements();
  model.script(text('Yes, the Mug.'));
  await (await ask()).arrayBuffer();
  assert.equal(
    await firstTokenMeasurements(),
    before,
    'in JSON there is no first token to measure',
  );

  // The fake model takes 50 ms between events: the first text arrives after a few of them
  // (message_start, ping, the thinking…).
  model.script(text('Yes, the Mug.', { pause: 50 }));
  await (await ask('text/event-stream')).text();
  const [point, ...others] = await points('shop.ai.time_to_first_token');
  assert.equal(others.length, 0);
  assert.equal(point!.value, before + 1);
  assert.deepEqual(point!.attributes, { model: 'claude-haiku-5-5' });
  assert.ok(point!.sum! > 0.1 && point!.sum! < 5, `${point!.sum} s`);
});
// #endregion metrics

// #region spans
const ofCalls = () =>
  exporter.getFinishedSpans().filter((span) => span.name === 'anthropic.messages.create');

/** Waits until there are n spans of calls to the model (a stream's ends when it's read whole). */
async function untilThereAre(n: number): Promise<ReadableSpan[]> {
  for (let ms = 0; ofCalls().length < n; ms += 20) {
    if (ms > 3000) assert.fail(`${ofCalls().length} spans of calls to the model, not ${n}`);
    await sleep(20);
  }
  return ofCalls();
}

test("every call to the model is a span of the SDK's, anthropic.messages.create, inside the request's", async () => {
  model.script(
    text('Yes, the Mug.', { usage: { input: 300, output: 20, cacheRead: 1650, cacheWrite: 0 } }),
  );
  const res = await ask();
  assert.equal(res.status, 200);
  const [span] = await untilThereAre(1);
  assert.equal(span!.kind, SpanKind.CLIENT);
  // OpenTelemetry's attributes for generative AI (gen_ai.*), which the SDK sets.
  assert.partialDeepStrictEqual(span!.attributes, {
    'gen_ai.provider.name': 'anthropic',
    'gen_ai.operation.name': 'chat',
    'gen_ai.request.model': 'claude-haiku-5-5',
    'gen_ai.request.max_tokens': 2048,
    'gen_ai.request.reasoning.level': 'low',
    'gen_ai.response.model': 'claude-haiku-5-5',
    'gen_ai.response.id': 'msg_fake_1',
    // The input, with the cache inside (unlike usage, where input_tokens goes without it).
    'gen_ai.usage.input_tokens': 1950,
    'gen_ai.usage.output_tokens': 20,
    'gen_ai.usage.cache_read.input_tokens': 1650,
    'gen_ai.usage.cache_write.input_tokens': 0,
    // Why it stopped, with the SDK's name.
    'anthropic.message.stop_reason': 'end_turn',
    'anthropic.request.id': 'req_fake_1',
  });
  // Without the conversation: metadata_only (client.ts).
  assert.ok(!JSON.stringify(span!.attributes).includes('mugs'));
  // A child of the request's span (the @hono/otel one), in its same trace: in Jaeger it shows
  // underneath.
  const request = exporter
    .getFinishedSpans()
    .find((s) => s.kind === SpanKind.SERVER && s.name === 'POST /v2/assistant');
  assert.ok(request, "the request's span");
  assert.equal(span!.spanContext().traceId, request!.spanContext().traceId);
  assert.equal(span!.parentSpanContext?.spanId, request!.spanContext().spanId);
});

test('with tools, one span per round, each one with its stop_reason', async () => {
  model.script(
    asksForTools(toolUseBlock('search_products', { query: 'mug' })),
    text('Yes, the Mug.'),
  );
  await (await ask()).arrayBuffer();
  const spans = await untilThereAre(2);
  assert.deepEqual(
    spans.map((span) => span.attributes['anthropic.message.stop_reason']),
    ['tool_use', 'end_turn'],
  );
});

test('streaming, the span says so (gen_ai.request.stream) and measures how long the first piece took', async () => {
  model.script(text('Yes, the Mug.', { pause: 20 }));
  await (await ask('text/event-stream')).text();
  const [span] = await untilThereAre(1);
  assert.equal(span!.attributes['gen_ai.request.stream'], true);
  assert.equal(span!.attributes['gen_ai.usage.output_tokens'], 30);
  assert.equal(span!.attributes['anthropic.message.stop_reason'], 'end_turn');
  assert.equal(typeof span!.attributes['gen_ai.response.time_to_first_chunk'], 'number');
});
// #endregion spans
