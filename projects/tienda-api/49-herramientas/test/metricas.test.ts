// Las métricas (Fase 10, lección 5): src/metricas.ts cuenta lo que le importa a la tienda (pedidos
// pagados, respuestas fuera del contrato, trabajos esperando) y @hono/otel mide cada petición.
// Aquí, en vez de mandarlas a Prometheus, se quedan en la memoria del test: un lector que las
// recoge cuando se le pide (collect), como hace Prometheus al recibirlas.
// Como en instrumentacion.test.ts, primero empieza la instrumentación y después se importa la
// tienda (y node:http, y lo que se quiera medir), con import().
import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { empezarInstrumentacion } from '../src/instrumentacion.ts';

// exportIntervalMillis enorme: no manda nada por su cuenta, solo cuando el test llama a collect().
const lector = new PeriodicExportingMetricReader({
  exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
  exportIntervalMillis: 3_600_000,
});
const instrumentacion = empezarInstrumentacion({ lectorMetricas: lector });

if (process.env.REDIS_URL_TESTS) process.env.REDIS_URL = process.env.REDIS_URL_TESTS;

const { OpenAPIHono, createRoute, z } = await import('@hono/zod-openapi');
const { requestId } = await import('hono/request-id');
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { firmar } = await import('../src/firma.ts');
const { cambiarEstado } = await import('../src/datos.ts');
const { conectarRedis } = await import('../src/almacen-redis.ts');
const { crearCola } = await import('../src/cola.ts');
const { validarRespuestas } = await import('../src/contrato-respuestas.ts');
const { metricas, observarCola, observarSalientes } = await import('../src/metricas.ts');
const { antiguedadPendientes } = await import('../src/salientes.ts');
const { pool } = await import('../src/bd.ts');
const { cerrarCola } = await import('../src/cola.ts');
const { cambiosDePedidos } = await import('../src/eventos-pedidos.ts');
const { cerrarLimites } = await import('../src/limites.ts');
const { usarBd } = await import('./bd.ts');

// Las conexiones con Redis que abre la tienda con REDIS_URL, como al apagarse (servidor.ts).
after(async () => {
  await cerrarCola();
  await cambiosDePedidos.cerrar();
  await cerrarLimites();
  await instrumentacion.apagar();
});
const { CARMEN, comoUsuario } = await import('./identidades.ts');

let carmen: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
});

type Punto = { atributos: Record<string, unknown>; valor: number };

/** Los puntos de una métrica, ahora: uno por cada combinación de atributos. */
async function puntos(nombre: string): Promise<Punto[]> {
  const { resourceMetrics } = await lector.collect();
  const metrica = resourceMetrics.scopeMetrics
    .flatMap((ambito) => ambito.metrics)
    .find((m) => m.descriptor.name === nombre);
  return (metrica?.dataPoints ?? []).map((punto) => ({
    atributos: punto.attributes as Record<string, unknown>,
    // El histograma no tiene un valor, sino un contador de mediciones.
    valor: typeof punto.value === 'number' ? punto.value : (punto.value as { count: number }).count,
  }));
}
const total = async (nombre: string) =>
  (await puntos(nombre)).reduce((suma, punto) => suma + punto.valor, 0);

async function pedidoNuevo(): Promise<number> {
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"productoId":1,"cantidad":1}',
  });
  return (await res.json()).id;
}

const pagar = (id: string, pedidoId: number) => {
  const cuerpo = JSON.stringify({ id, tipo: 'pago.completado', pedidoId });
  return app.request('/v2/webhooks/pagos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firma': firmar(cuerpo, config.WEBHOOK_SECRET),
    },
    body: cuerpo,
  });
};

test('pagar un pedido suma 1 a tienda.pedidos.pagados', async () => {
  const antes = await total('tienda.pedidos.pagados');
  const pedido = await pedidoNuevo();
  assert.equal((await pagar('evt_metricas_1', pedido)).status, 200);
  assert.equal((await total('tienda.pedidos.pagados')) - antes, 1);
});

test('el mismo evento otra vez no suma nada', async () => {
  const pedido = await pedidoNuevo();
  await pagar('evt_metricas_2', pedido);
  const antes = await total('tienda.pedidos.pagados');
  const repetido = await pagar('evt_metricas_2', pedido);
  assert.equal(((await repetido.json()) as { repetido: boolean }).repetido, true);
  assert.equal((await total('tienda.pedidos.pagados')) - antes, 0);
});

test('un pago de un pedido cancelado (el estado no cambia) no suma nada', async () => {
  const pedido = await pedidoNuevo();
  assert.ok(await cambiarEstado(pedido, 'cancelado', 'pendiente'));
  const antes = await total('tienda.pedidos.pagados');
  assert.equal((await pagar('evt_metricas_3', pedido)).status, 200);
  assert.equal((await total('tienda.pedidos.pagados')) - antes, 0);
});

test('una petición queda medida por la plantilla de la ruta, no por la URL', async () => {
  const res = await app.request('/v2/productos/1');
  await res.arrayBuffer();
  const rutas = (await puntos('http.server.request.duration')).map(
    (p) => p.atributos['http.route'],
  );
  assert.ok(rutas.includes('/v2/productos/:id'), `rutas medidas: ${rutas.join(', ')}`);
  assert.ok(!rutas.includes('/v2/productos/1'));
  // El panel de errores 5xx filtra por este atributo: si @hono/otel lo renombrara, el panel se
  // quedaría vacío sin avisar, y aquí falla.
  const estados = (await puntos('http.server.request.duration')).map(
    (p) => p.atributos['http.response.status_code'],
  );
  assert.ok(estados.includes(200), `estados medidos: ${estados.join(', ')}`);
});

// Una API con una ruta que rompe su contrato a propósito (como en contrato.test.ts).
function apiRota() {
  const rota = new OpenAPIHono();
  rota.use(requestId());
  rota.use(
    validarRespuestas('registrar', {
      prefijo: '',
      documento: () =>
        rota.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'rota', version: '1' } }),
    }),
  );
  rota.openapi(
    createRoute({
      method: 'get',
      path: '/cosas/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: 'La cosa',
          content: { 'application/json': { schema: z.object({ nombre: z.string() }) } },
        },
      },
    }),
    (c) => c.json({ titulo: 'x' } as never, 200),
  );
  return rota;
}

test('una respuesta fuera del contrato suma 1, con la plantilla de la ruta como ruta', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    const antes = await total('tienda.respuestas.fuera_de_contrato');
    await apiRota().request('/cosas/7');
    await apiRota().request('/cosas/8');
    const despues = await puntos('tienda.respuestas.fuera_de_contrato');
    assert.equal(despues.reduce((s, p) => s + p.valor, 0) - antes, 2);
    // Las dos, bajo una sola ruta: la plantilla, no /cosas/7 ni /cosas/8.
    assert.deepEqual(
      despues.map((p) => p.atributos.ruta),
      ['/cosas/{id}'],
    );
  } finally {
    aviso.mock.restore();
  }
});

test('una respuesta que cumple el contrato no suma', async () => {
  const antes = await total('tienda.respuestas.fuera_de_contrato');
  await app.request('/v2/productos');
  assert.equal((await total('tienda.respuestas.fuera_de_contrato')) - antes, 0);
});

test('metricas lleva los dos contadores', () => {
  assert.equal(typeof metricas.pedidosPagados.add, 'function');
  assert.equal(typeof metricas.respuestasFueraDeContrato.add, 'function');
});

test('tienda.cola.esperando: sin Redis que conteste, no informa ningún valor', async () => {
  const sinRespuesta = { getWaitingCount: () => Promise.reject(new Error('Redis no contesta')) };
  const dejarDeObservar = observarCola(sinRespuesta, { esperaMs: 200 });
  try {
    assert.deepEqual(await puntos('tienda.cola.esperando'), []);
  } finally {
    dejarDeObservar();
  }
});

test('tienda.cola.esperando: sin Redis que conteste a tiempo, tampoco', async () => {
  const lenta = { getWaitingCount: () => new Promise<number>(() => {}) };
  const dejarDeObservar = observarCola(lenta, { esperaMs: 100 });
  try {
    assert.deepEqual(await puntos('tienda.cola.esperando'), []);
  } finally {
    dejarDeObservar();
  }
});

test('tienda.cola.esperando: con una lectura sin acabar, no empieza otra', async () => {
  let lecturas = 0;
  const congelada = {
    getWaitingCount: () => {
      lecturas++;
      return new Promise<number>(() => {});
    },
  };
  const dejarDeObservar = observarCola(congelada, { esperaMs: 50 });
  try {
    for (let i = 0; i < 3; i++) await puntos('tienda.cola.esperando');
    assert.equal(lecturas, 1);
  } finally {
    dejarDeObservar();
  }
});

test(
  'tienda.cola.esperando: cuenta los trabajos que esperan en la cola',
  { skip: process.env.REDIS_URL_TESTS ? false : 'sin Redis: pon REDIS_URL_TESTS en test/.env' },
  async () => {
    const conexion = conectarRedis(process.env.REDIS_URL_TESTS!);
    const cola = crearCola(conexion);
    const dejarDeObservar = observarCola(cola);
    try {
      await cola.obliterate({ force: true });
      assert.equal(await total('tienda.cola.esperando'), 0);
      // Sin trabajador, nadie los coge: se quedan esperando.
      await cola.add('correo-de-confirmacion', { tipo: 'correo-de-confirmacion' } as never);
      await cola.add('correo-de-confirmacion', { tipo: 'correo-de-confirmacion' } as never, {
        jobId: 'otro',
      });
      assert.equal(await total('tienda.cola.esperando'), 2);
    } finally {
      dejarDeObservar();
      await cola.obliterate({ force: true });
      await cola.close();
      conexion.destroy();
    }
  },
);

// La antigüedad del evento saliente más viejo sin enviar (lección 6): se lee de PostgreSQL, no de
// Redis, para que siga diciendo la verdad cuando el Redis de la cola es lo que ha fallado.
const ANTIGUEDAD = 'tienda.salientes.antiguedad';
// La primera, la que no informa: el lector manda el último valor que vio de cada indicador
// (temporalidad acumulada), y después de los otros dos tests seguiría viéndolo.
test('tienda.salientes.antiguedad: sin PostgreSQL que conteste a tiempo, ningún valor, y una lectura a la vez', async () => {
  let lecturas = 0;
  const congelada = () => {
    lecturas++;
    return new Promise<number>(() => {});
  };
  const dejarDeObservar = observarSalientes(congelada, { esperaMs: 50 });
  try {
    for (let i = 0; i < 3; i++) assert.deepEqual(await puntos(ANTIGUEDAD), []);
    assert.equal(lecturas, 1);
  } finally {
    dejarDeObservar();
  }
});

test('tienda.salientes.antiguedad: 0 sin eventos pendientes', async () => {
  await pool.query('UPDATE eventos_salientes SET enviado_en = now() WHERE enviado_en IS NULL');
  const dejarDeObservar = observarSalientes(antiguedadPendientes);
  try {
    assert.equal(await total(ANTIGUEDAD), 0);
  } finally {
    dejarDeObservar();
  }
});

test('tienda.salientes.antiguedad: los segundos del pendiente más antiguo', async () => {
  await pool.query('UPDATE eventos_salientes SET enviado_en = now() WHERE enviado_en IS NULL');
  // Dos pendientes, uno de hace 90 segundos y otro de ahora, y uno enviado de hace una hora.
  await pool.query(`
    INSERT INTO eventos_salientes (tipo, datos, creado_en, enviado_en) VALUES
      ('correo-de-confirmacion', '{}', now() - interval '90 seconds', NULL),
      ('correo-de-confirmacion', '{}', now(), NULL),
      ('correo-de-confirmacion', '{}', now() - interval '1 hour', now())`);
  const dejarDeObservar = observarSalientes(antiguedadPendientes);
  try {
    const segundos = await total(ANTIGUEDAD);
    assert.ok(segundos >= 90 && segundos < 95, `${segundos} s`);
  } finally {
    dejarDeObservar();
    await pool.query('UPDATE eventos_salientes SET enviado_en = now() WHERE enviado_en IS NULL');
  }
});
