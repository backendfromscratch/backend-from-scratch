// Las trazas (Fase 10, lección 4), con OpenTelemetry. Una traza es el camino de una petición: cada
// trozo de trabajo (la petición entera, cada consulta a PostgreSQL, cada orden a Redis, el trabajo
// en la cola) es un span, con cuándo empezó, cuánto duró y dentro de qué otro span pasó. Todos los
// de una petición llevan el mismo id de traza, aunque pasen por dos procesos (la API y el
// trabajador), y Jaeger los junta y los dibuja.
// Este fichero se carga antes que la tienda, con node --import ./src/instrumentacion.ts (npm start,
// npm run trabajador y el CMD del Dockerfile): las instrumentaciones cambian pg, redis, pino y
// node:http al cargarlos, y si la tienda ya los hubiera cargado, llegarían tarde.
// Sin OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, no hace nada: la tienda funciona igual, sin trazas.
// #region importar
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import type { MetricReader } from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { register } from 'import-in-the-middle/register-hooks.mjs';
// #endregion importar

export interface Instrumentacion {
  /** Manda los spans que quedan por mandar y para. Al apagarse la API o el trabajador. */
  apagar(): Promise<void>;
}

// #region empezar
// exportador: a dónde van los spans. Sin él, a la URL de OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (Jaeger,
// en compose.observabilidad.yaml), por OTLP, el protocolo de OpenTelemetry. Los tests le dan uno
// que los guarda en memoria. lectorMetricas: para las métricas, a partir del paso 45.
export function empezarInstrumentacion(
  opciones: { exportador?: SpanExporter; lectorMetricas?: MetricReader } = {},
): Instrumentacion {
  const urlTrazas = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!urlTrazas && !opciones.exportador && !opciones.lectorMetricas) {
    return { apagar: async () => {} };
  }

  // Las instrumentaciones, para los import de la tienda (ESM): import-in-the-middle se pone entre
  // cada import y el módulo que carga, y deja que las instrumentaciones lo cambien. Con
  // module.registerHooks de Node, en el mismo hilo (module.register está obsoleto: DEP0205).
  register();

  const sdk = new NodeSDK({
    // Los spans, en lotes: cada pocos segundos, todos los terminados en una sola petición a Jaeger
    // (BatchSpanProcessor). Uno a uno (SimpleSpanProcessor) solo en los tests, para verlos enseguida.
    spanProcessors: opciones.exportador
      ? [new SimpleSpanProcessor(opciones.exportador)]
      : urlTrazas
        ? [new BatchSpanProcessor(new OTLPTraceExporter())]
        : [],
    metricReaders: opciones.lectorMetricas ? [opciones.lectorMetricas] : [],
    // Los logs siguen en la salida, como siempre (pino): no se mandan a ningún sitio. Sin esto, el
    // SDK intentaría mandarlos por OTLP a localhost.
    logRecordProcessors: [],
    // #region instrumentaciones
    // Qué se mide, una por una (y no las cuarenta de auto-instrumentations-node):
    instrumentations: [
      // Las peticiones que salen por node:http, como los avisos a la empresa de reparto
      // (url-segura.ts). Las que llegan, no: de esas ya hace un span Hono (app.ts), con la ruta.
      new HttpInstrumentation({ disableIncomingRequestInstrumentation: true }),
      // Las que salen con fetch (openid-client, al hablar con el proveedor de identidad).
      new UndiciInstrumentation(),
      // Cada consulta a PostgreSQL y a Redis, pero solo dentro de una petición o de un trabajo
      // (requireParentSpan): el repartidor pregunta a PostgreSQL cada segundo, y el trabajador espera
      // trabajos en Redis sin parar, y cada vez sería una traza suelta de un span.
      new PgInstrumentation({ requireParentSpan: true }),
      new RedisInstrumentation({ requireParentSpan: true }),
      // En cada línea del log, trace_id y span_id: de una línea, a su traza en Jaeger.
      new PinoInstrumentation({ disableLogSending: true }),
    ],
    // #endregion instrumentaciones
  });
  sdk.start();
  return { apagar: () => sdk.shutdown() };
}
// #endregion empezar

// Al cargarse con --import, empieza: con la URL de Jaeger, si la hay. servidor.ts y trabajador.ts
// llaman a su apagar() al apagarse, para no perder los últimos spans.
export const instrumentacion = empezarInstrumentacion();
