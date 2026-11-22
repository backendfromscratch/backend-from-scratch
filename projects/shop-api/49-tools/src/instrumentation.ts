// The traces (Phase 10, lesson 4), with OpenTelemetry. A trace is a request's path: each piece of
// work (the whole request, each query to PostgreSQL, each Redis command, the job in the queue) is a
// span, with when it started, how long it took and inside which other span it happened. All the
// spans of a request carry the same trace id, even if they go through two processes (the API and
// the worker), and Jaeger puts them together and draws them.
// This file is loaded before the shop, with node --import ./src/instrumentation.ts (npm start,
// npm run worker and the Dockerfile's CMD): the instrumentations change pg, redis, pino and
// node:http when they are loaded, and if the shop had already loaded them, they would arrive late.
// The metrics (Phase 10, lesson 5), the same: with OTEL_EXPORTER_OTLP_METRICS_ENDPOINT it sends them
// to Prometheus. Without either URL, it does nothing: the shop works the same, without traces or
// metrics.
// #region imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader, type MetricReader } from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { register } from 'import-in-the-middle/register-hooks.mjs';
// #endregion imports

export interface Instrumentation {
  /** Sends the spans that are left to send and stops. When the API or the worker shut down. */
  shutdown(): Promise<void>;
}

// #region command-without-data
// A trace must not carry what the log doesn't. Each Redis span writes down the command that was
// sent (db.query.text), and the instrumentation, unless told otherwise, also writes down the key,
// and in many commands all the values. The limits' keys carry the email and the IP of whoever tries
// to sign in (limits:session-email:ana@example.com, from rate-limits.ts and redis-store.ts), and
// that must not leave the shop. So only the command and the first part of the key, up to the
// colon, which says what it is for: "ZADD limits:?", "PUBLISH shop:?". A key with no colon is not
// written down.
export function commandWithoutData(command: string, args: Array<string | Buffer>): string {
  const key = args[0] === undefined ? '' : String(args[0]);
  const colon = key.indexOf(':');
  return colon > 0 ? `${command} ${key.slice(0, colon)}:?` : command;
}
// #endregion command-without-data

// #region without-query
// The same with URLs: each HTTP span writes down the whole URL (url.full), with the query. The
// span of each request that arrives (app.ts), and in the return from the identity provider (Phase
// 6) the query carries the code and the state; those of the ones that leave: the notices to the
// delivery company, to a URL it gives and that may carry a token in the query, and fetch's
// (openid-client). The log only writes down the path (middleware/request-log.ts), so the trace does
// too: the URL, without the query.
export function urlWithoutQuery(url: string): string {
  const parsed = URL.parse(url);
  if (!parsed) return url.split(/[?#]/)[0]!;
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

// A span processor is what the SDK calls with each span. This one, when a span is about to end (and
// can still be changed), takes the query off url.full, whichever instrumentation it comes from. It
// goes before the one that sends them to Jaeger.
const removeQuery: SpanProcessor = {
  onStart() {},
  onEnding(span) {
    const url = span.attributes['url.full'];
    if (typeof url === 'string') span.setAttribute('url.full', urlWithoutQuery(url));
  },
  onEnd() {},
  forceFlush: async () => {},
  shutdown: async () => {},
};
// #endregion without-query

// #region start
// exporter: where the spans go. Without it, to the URL in OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
// (Jaeger, in compose.observability.yaml), over OTLP, OpenTelemetry's protocol. The tests give it
// one that keeps them in memory. metricReader: whoever collects the metrics; without it, one that
// sends them to the URL in OTEL_EXPORTER_OTLP_METRICS_ENDPOINT (Prometheus), every 5 seconds, and
// the tests give it one that keeps them in memory.
export function startInstrumentation(
  options: { exporter?: SpanExporter; metricReader?: MetricReader } = {},
): Instrumentation {
  const tracesUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const metricsUrl = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  const metricReader =
    options.metricReader ??
    (metricsUrl
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis: 5000,
        })
      : undefined);
  if (!tracesUrl && !options.exporter && !metricReader) {
    return { shutdown: async () => {} };
  }

  // The instrumentations, for the shop's imports (ESM): import-in-the-middle sits between each
  // import and the module it loads, and lets the instrumentations change it. With Node's
  // module.registerHooks, in the same thread (module.register is deprecated: DEP0205).
  register();

  const sdk = new NodeSDK({
    // The spans, in batches: every few seconds, all those finished in a single request to Jaeger
    // (BatchSpanProcessor). One by one (SimpleSpanProcessor) only in the tests, to see them at once.
    spanProcessors: [
      removeQuery,
      ...(options.exporter
        ? [new SimpleSpanProcessor(options.exporter)]
        : tracesUrl
          ? [new BatchSpanProcessor(new OTLPTraceExporter())]
          : []),
    ],
    metricReaders: metricReader ? [metricReader] : [],
    // The logs stay on the output, as always (pino): they aren't sent anywhere. Without this, the
    // SDK would try to send them over OTLP to localhost.
    logRecordProcessors: [],
    // #region instrumentations
    // What is measured, one by one (and not the forty of auto-instrumentations-node):
    instrumentations: [
      // The requests that leave through node:http, like the notices to the delivery company
      // (safe-url.ts). The ones that arrive, no: for those a Hono span already exists (app.ts), with
      // the route.
      new HttpInstrumentation({ disableIncomingRequestInstrumentation: true }),
      // The ones that leave with fetch (openid-client, when talking to the identity provider).
      new UndiciInstrumentation(),
      // Each query to PostgreSQL and Redis, but only inside a request or a job (requireParentSpan):
      // the relayer asks PostgreSQL every second, and the worker waits for jobs in Redis nonstop,
      // and every time it would be a loose trace of one span.
      new PgInstrumentation({ requireParentSpan: true }),
      new RedisInstrumentation({
        requireParentSpan: true,
        dbStatementSerializer: commandWithoutData,
      }),
      // On each log line, trace_id and span_id: from a line, to its trace in Jaeger.
      new PinoInstrumentation({ disableLogSending: true }),
    ],
    // #endregion instrumentations
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
// #endregion start

// When loaded with --import, it starts: with Jaeger's URL and Prometheus's, if there are any.
// server.ts and worker.ts call its shutdown() when shutting down, so the last spans aren't lost.
export const instrumentation = startInstrumentation();
