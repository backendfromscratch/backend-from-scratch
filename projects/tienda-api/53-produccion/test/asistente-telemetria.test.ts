// El asistente en las trazas y en las métricas (Fase 11, lección 7). Como en instrumentacion.test.ts
// y metricas.test.ts, la instrumentación empieza antes de importar la tienda, con un exportador de
// spans y un lector de métricas que se quedan en la memoria del test. Y el modelo falso, antes
// también: el SDK lee ANTHROPIC_BASE_URL al crear el cliente.
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { SpanKind } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { empezarInstrumentacion } from '../src/instrumentacion.ts';
import { arrancarModeloFalso, bloqueHerramienta, pideHerramientas, texto } from './modelo-falso.ts';

const exportador = new InMemorySpanExporter();
const lector = new PeriodicExportingMetricReader({
  exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
  exportIntervalMillis: 3_600_000,
});
const instrumentacion = empezarInstrumentacion({ exportador, lectorMetricas: lector });

const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => {
  modelo.reiniciar();
  exportador.reset();
});

const { app } = await import('../src/app.ts');
const { usarEmbebedor } = await import('../src/embeddings.ts');
const { almacen, crearAlmacenEnMemoria } = await import('../src/limites.ts');
const { usarBd } = await import('./bd.ts');
const { crearEmbebedorFalso } = await import('./embebedor-falso.ts');
const { CARMEN, comoUsuario } = await import('./identidades.ts');

after(() => instrumentacion.apagar());
usarEmbebedor(crearEmbebedorFalso());
beforeEach(() => Object.assign(almacen, crearAlmacenEnMemoria()));

let carmen: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
});

const preguntar = (accept = 'application/json') =>
  app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...carmen },
    body: JSON.stringify({ mensajes: [{ rol: 'usuario', texto: '¿Tenéis tazas?' }] }),
  });

// #region metricas
type Punto = { atributos: Record<string, unknown>; valor: number; suma?: number };

/** Los puntos de una métrica, ahora; de un histograma, el número de medidas y su suma. */
async function puntos(nombre: string): Promise<Punto[]> {
  const { resourceMetrics } = await lector.collect();
  const metrica = resourceMetrics.scopeMetrics
    .flatMap((ambito) => ambito.metrics)
    .find((m) => m.descriptor.name === nombre);
  return (metrica?.dataPoints ?? []).map((punto) => {
    const valor = punto.value as number | { count: number; sum: number };
    return typeof valor === 'number'
      ? { atributos: punto.attributes as Record<string, unknown>, valor }
      : {
          atributos: punto.attributes as Record<string, unknown>,
          valor: valor.count,
          suma: valor.sum,
        };
  });
}

const deTipo = async (tipo: string) =>
  (await puntos('tienda.ia.tokens')).find((p) => p.atributos.tipo === tipo)?.valor ?? 0;
const coste = async () =>
  (await puntos('tienda.ia.coste_dolares')).reduce((suma, p) => suma + p.valor, 0);
const medidasPrimerToken = async () =>
  (await puntos('tienda.ia.tiempo_primer_token')).reduce((suma, p) => suma + p.valor, 0);

test('tienda.ia.tokens y tienda.ia.coste_dolares: cada llamada suma sus tokens, por modelo y tipo, y su coste', async () => {
  const antes = {
    entrada: await deTipo('entrada'),
    salida: await deTipo('salida'),
    lectura: await deTipo('lectura_cache'),
    escritura: await deTipo('escritura_cache'),
    coste: await coste(),
  };
  modelo.guion(
    texto('Sí, la Taza.', {
      uso: { entrada: 1000, salida: 200, lecturaCache: 2000, escrituraCache: 500 },
    }),
  );
  assert.equal((await preguntar()).status, 200);
  assert.equal((await deTipo('entrada')) - antes.entrada, 1000);
  assert.equal((await deTipo('salida')) - antes.salida, 200);
  assert.equal((await deTipo('lectura_cache')) - antes.lectura, 2000);
  assert.equal((await deTipo('escritura_cache')) - antes.escritura, 500);
  // 0,0002825 $, como en el log (asistente-coste.test.ts).
  assert.ok(Math.abs((await coste()) - antes.coste - 0.0002825) < 1e-12);
  // Los atributos: el modelo y el tipo, nunca el cliente (una serie por cliente no tendría fin).
  for (const punto of await puntos('tienda.ia.tokens')) {
    assert.deepEqual(Object.keys(punto.atributos).sort(), ['modelo', 'tipo']);
    assert.equal(punto.atributos.modelo, 'claude-haiku-5-5');
  }
});

test('tienda.ia.tiempo_primer_token: una medida por respuesta en streaming, en segundos; en JSON, ninguna', async () => {
  const antes = await medidasPrimerToken();
  modelo.guion(texto('Sí, la Taza.'));
  await (await preguntar()).arrayBuffer();
  assert.equal(await medidasPrimerToken(), antes, 'en JSON no hay primer token que medir');

  // El modelo falso tarda 50 ms entre evento y evento: el primer texto llega después de unos
  // cuantos (message_start, ping, el thinking…).
  modelo.guion(texto('Sí, la Taza.', { pausa: 50 }));
  await (await preguntar('text/event-stream')).text();
  const [punto, ...otros] = await puntos('tienda.ia.tiempo_primer_token');
  assert.equal(otros.length, 0);
  assert.equal(punto!.valor, antes + 1);
  assert.deepEqual(punto!.atributos, { modelo: 'claude-haiku-5-5' });
  assert.ok(punto!.suma! > 0.1 && punto!.suma! < 5, `${punto!.suma} s`);
});
// #endregion metricas

// #region spans
const deLlamada = () =>
  exportador.getFinishedSpans().filter((span) => span.name === 'anthropic.messages.create');

/** Espera hasta tener n spans de llamadas al modelo (el de un flujo termina al leerlo entero). */
async function hastaTener(n: number): Promise<ReadableSpan[]> {
  for (let ms = 0; deLlamada().length < n; ms += 20) {
    if (ms > 3000) assert.fail(`${deLlamada().length} spans de llamadas al modelo, no ${n}`);
    await dormir(20);
  }
  return deLlamada();
}

test('cada llamada al modelo es un span del SDK, anthropic.messages.create, dentro del de la petición', async () => {
  modelo.guion(
    texto('Sí, la Taza.', {
      uso: { entrada: 300, salida: 20, lecturaCache: 1650, escrituraCache: 0 },
    }),
  );
  const res = await preguntar();
  assert.equal(res.status, 200);
  const [span] = await hastaTener(1);
  assert.equal(span!.kind, SpanKind.CLIENT);
  // Los atributos de OpenTelemetry para la IA generativa (gen_ai.*), que pone el SDK.
  assert.partialDeepStrictEqual(span!.attributes, {
    'gen_ai.provider.name': 'anthropic',
    'gen_ai.operation.name': 'chat',
    'gen_ai.request.model': 'claude-haiku-5-5',
    'gen_ai.request.max_tokens': 2048,
    'gen_ai.request.reasoning.level': 'low',
    'gen_ai.response.model': 'claude-haiku-5-5',
    'gen_ai.response.id': 'msg_falso_1',
    // La entrada, con la caché dentro (al revés que usage, donde input_tokens va sin ella).
    'gen_ai.usage.input_tokens': 1950,
    'gen_ai.usage.output_tokens': 20,
    'gen_ai.usage.cache_read.input_tokens': 1650,
    'gen_ai.usage.cache_write.input_tokens': 0,
    // Por qué paró, con el nombre del SDK.
    'anthropic.message.stop_reason': 'end_turn',
    'anthropic.request.id': 'req_falso_1',
  });
  // Sin la conversación: metadata_only (cliente.ts).
  assert.ok(!JSON.stringify(span!.attributes).includes('tazas'));
  // Hijo del span de la petición (el de @hono/otel), en su misma traza: en Jaeger sale debajo.
  const peticion = exportador
    .getFinishedSpans()
    .find((s) => s.kind === SpanKind.SERVER && s.name === 'POST /v2/asistente');
  assert.ok(peticion, 'el span de la petición');
  assert.equal(span!.spanContext().traceId, peticion!.spanContext().traceId);
  assert.equal(span!.parentSpanContext?.spanId, peticion!.spanContext().spanId);
});

test('con herramientas, un span por vuelta, cada uno con su stop_reason', async () => {
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_productos', { consulta: 'taza' })),
    texto('Sí, la Taza.'),
  );
  await (await preguntar()).arrayBuffer();
  const spans = await hastaTener(2);
  assert.deepEqual(
    spans.map((span) => span.attributes['anthropic.message.stop_reason']),
    ['tool_use', 'end_turn'],
  );
});

test('en streaming, el span lo dice (gen_ai.request.stream) y mide cuánto tardó el primer trozo', async () => {
  modelo.guion(texto('Sí, la Taza.', { pausa: 20 }));
  await (await preguntar('text/event-stream')).text();
  const [span] = await hastaTener(1);
  assert.equal(span!.attributes['gen_ai.request.stream'], true);
  assert.equal(span!.attributes['gen_ai.usage.output_tokens'], 30);
  assert.equal(span!.attributes['anthropic.message.stop_reason'], 'end_turn');
  assert.equal(typeof span!.attributes['gen_ai.response.time_to_first_chunk'], 'number');
});
// #endregion spans
