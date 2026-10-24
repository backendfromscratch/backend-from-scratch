// Las trazas (Fase 10, lección 4): src/instrumentacion.ts arranca OpenTelemetry, y cada petición y
// cada trabajo dejan sus spans. Aquí, en vez de mandarlos a Jaeger, se quedan en la memoria del
// test (InMemorySpanExporter), para mirarlos.
// El orden importa: la instrumentación tiene que empezar ANTES de que se carguen pg, redis, BullMQ o
// pino, porque los cambia al cargarlos. Por eso este fichero no importa nada de la tienda arriba,
// como los demás: empieza la instrumentación y, después, la importa con import(). En la tienda de
// verdad lo mismo lo hace node --import ./src/instrumentacion.ts.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { promisify } from 'node:util';
import { SpanKind } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { empezarInstrumentacion } from '../src/instrumentacion.ts';

const exportador = new InMemorySpanExporter();
const instrumentacion = empezarInstrumentacion({ exportador });

// Ahora sí, la tienda.
const { serve } = await import('@hono/node-server');
const { app } = await import('../src/app.ts');
const { conectarRedis } = await import('../src/almacen-redis.ts');
const { crearCola, crearTrabajador, encolar } = await import('../src/cola.ts');
const { config } = await import('../src/config.ts');
const { firmar } = await import('../src/firma.ts');
const { repartir } = await import('../src/salientes.ts');
const { pool } = await import('../src/bd.ts');
const { usarBd } = await import('./bd.ts');

usarBd();

const url = process.env.REDIS_URL_TESTS;
const sinRedis = url
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// La API de verdad, en un puerto libre: así la petición pasa por node:http, como en producción, y
// se ve si la instrumentación de http añade otro span de servidor.
let tienda: string;
let servidor: ReturnType<typeof serve>;
before(async () => {
  servidor = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  await once(servidor, 'listening');
  tienda = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(async () => {
  servidor.close();
  await instrumentacion.apagar();
});

const spans = () => exportador.getFinishedSpans();
const deLaTraza = (traza: string) => spans().filter((s) => s.spanContext().traceId === traza);

/** Los spans de servidor: uno por cada petición que ha recibido la API. */
const deServidor = () => spans().filter((s) => s.kind === SpanKind.SERVER);

/** Espera hasta que se cumpla la condición, o falla pasado el tiempo. */
async function esperar(condicion: () => boolean | Promise<boolean>, ms = 10_000, que = '') {
  const hasta = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > hasta) assert.fail(`pasados ${ms} ms, aún no: ${que}`);
    await dormir(50);
  }
}

test('una petición deja un span de servidor, con la ruta y el requestId, y uno por consulta', async () => {
  exportador.reset();
  const res = await fetch(`${tienda}/v2/productos`);
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  await esperar(() => deServidor().length > 0, 5000, 'el span de la petición');

  // Uno solo: el de Hono (@hono/otel). La instrumentación de http no añade el suyo.
  const [peticion, ...otros] = deServidor();
  assert.equal(otros.length, 0, 'un solo span de servidor');
  // Con la plantilla de la ruta, no la URL: GET /v2/pedidos/:id, nunca GET /v2/pedidos/7.
  assert.equal(peticion!.name, 'GET /v2/productos');
  assert.equal(peticion!.attributes['http.route'], '/v2/productos');
  // El id que ve quien llama (la cabecera X-Request-Id) encuentra la traza.
  assert.equal(peticion!.attributes['tienda.request_id'], res.headers.get('x-request-id'));

  // Y sus consultas a PostgreSQL, dentro: spans hijos del de la petición.
  const traza = peticion!.spanContext().traceId;
  const consultas = deLaTraza(traza).filter((s) => s.attributes['db.system.name'] === 'postgresql');
  assert.ok(consultas.length >= 1, 'al menos una consulta');
  assert.ok(
    consultas.some((s) => s.parentSpanContext?.spanId === peticion!.spanContext().spanId),
    'una consulta, hija directa de la petición',
  );
});

test('una ruta con un parámetro: el span lleva la plantilla, no el id', async () => {
  exportador.reset();
  const res = await fetch(`${tienda}/v2/productos/1`);
  await res.arrayBuffer();
  await esperar(() => deServidor().length > 0, 5000, 'el span de la petición');
  assert.equal(deServidor()[0]!.name, 'GET /v2/productos/:id');
});

/** La pasarela avisa de que el pedido está pagado (scripts/pasarela.ts). */
async function pagar(pedidoId: number) {
  const cuerpo = JSON.stringify({ id: `evt_traza_${pedidoId}`, tipo: 'pago.completado', pedidoId });
  return fetch(`${tienda}/v2/webhooks/pagos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firma': firmar(cuerpo, config.WEBHOOK_SECRET),
    },
    body: cuerpo,
  });
}

test(
  'del pago al trabajador, una sola traza: pasa por eventos_salientes y por la cola',
  { skip: sinRedis },
  async () => {
    const conexion = conectarRedis(url!);
    const cola = crearCola(conexion);
    await cola.obliterate({ force: true });
    await pool.query('DELETE FROM avisos');
    exportador.reset();
    const trabajador = crearTrabajador({ url: url! });
    try {
      // El 21, pendiente, es de Carmen. Sin avisos guardados: un solo trabajo, el correo.
      const res = await pagar(21);
      assert.equal(res.status, 200);
      await res.arrayBuffer();
      await esperar(() => deServidor().length > 0, 5000, 'el span del pago');
      const pago = deServidor()[0]!;
      assert.equal(pago.name, 'POST /v2/webhooks/pagos');
      const traza = pago.spanContext().traceId;

      // El evento saliente guarda la traza en la que se creó (W3C traceparent): versión, traza,
      // span y opciones (01: se guarda).
      const { rows } = await pool.query<{ contexto: string | null }>(
        'SELECT contexto FROM eventos_salientes',
      );
      assert.equal(rows.length, 1);
      assert.match(rows[0]!.contexto ?? '', new RegExp(`^00-${traza}-[0-9a-f]{16}-01$`));

      // El repartidor (en el trabajador, sin petición) lo pone en la cola, en esa misma traza.
      assert.equal(await repartir(50, (trabajo) => encolar(trabajo, cola)), 1);
      await esperar(
        () => deLaTraza(traza).some((s) => s.kind === SpanKind.CONSUMER),
        10_000,
        'el span del trabajador, en la traza del pago',
      );
      const enLaTraza = deLaTraza(traza);
      const productor = enLaTraza.find((s) => s.kind === SpanKind.PRODUCER);
      assert.equal(productor?.name, 'add tienda.correo-de-confirmacion');
      const consumidor = enLaTraza.find((s) => s.kind === SpanKind.CONSUMER);
      assert.equal(consumidor?.name, 'process tienda');
      assert.equal(consumidor?.parentSpanContext?.spanId, productor?.spanContext().spanId);
    } finally {
      await trabajador.cerrar();
      await cola.obliterate({ force: true });
      await cola.close();
      conexion.destroy();
    }
  },
);

test(
  'un evento guardado sin traza (de antes de este paso) se reparte igual',
  { skip: sinRedis },
  async () => {
    const conexion = conectarRedis(url!);
    const cola = crearCola(conexion);
    try {
      await cola.obliterate({ force: true });
      await pool.query('DELETE FROM eventos_salientes');
      await pool.query(
        `INSERT INTO eventos_salientes (tipo, datos) VALUES ('correo-de-confirmacion', $1)`,
        [{ tipo: 'correo-de-confirmacion', pedido: { id: 22 } }],
      );
      assert.equal(await repartir(50, (trabajo) => encolar(trabajo, cola)), 1);
      assert.equal(await cola.count(), 1);
    } finally {
      await cola.obliterate({ force: true });
      await cola.close();
      conexion.destroy();
    }
  },
);

const ejecutar = promisify(execFile);

/** El entorno de los tests sin ninguna variable de OpenTelemetry. */
function sinOtel(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([nombre]) => !nombre.startsWith('OTEL_')),
  );
}

// Lo que cada proceso imprime al final: quién da los spans. Sin SDK, el de «no hacer nada» de la
// API de OpenTelemetry (NoopTracerProvider).
const PROVEEDOR = `import { trace } from '@opentelemetry/api';
import { instrumentacion } from './src/instrumentacion.ts';
trace.getTracer('prueba').startSpan('una-prueba').end();
await instrumentacion.apagar();
console.log(trace.getTracerProvider().getDelegate().constructor.name);`;

test('sin OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, no arranca nada y no escribe nada en stderr', async () => {
  const { stdout, stderr } = await ejecutar(
    'node',
    ['--import', './src/instrumentacion.ts', '--input-type=module', '-e', PROVEEDOR],
    { env: sinOtel() },
  );
  assert.equal(stdout, 'NoopTracerProvider\n');
  assert.equal(stderr, '');
});

test('con OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, manda los spans ahí, y sin avisos en stderr', async () => {
  // Un Jaeger de mentira: apunta lo que le llega.
  const recibidas: { url: string | undefined; tipo: string | undefined; cuerpo: Buffer }[] = [];
  const receptor = createServer(async (peticion, respuesta) => {
    const trozos: Buffer[] = [];
    for await (const trozo of peticion) trozos.push(trozo as Buffer);
    recibidas.push({
      url: peticion.url,
      tipo: peticion.headers['content-type'],
      cuerpo: Buffer.concat(trozos),
    });
    respuesta.writeHead(200).end();
  });
  receptor.listen(0, '127.0.0.1');
  await once(receptor, 'listening');
  try {
    const { port } = receptor.address() as AddressInfo;
    const { stdout, stderr } = await ejecutar(
      'node',
      ['--import', './src/instrumentacion.ts', '--input-type=module', '-e', PROVEEDOR],
      {
        env: {
          ...sinOtel(),
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${port}/v1/traces`,
          OTEL_SERVICE_NAME: 'tienda-prueba',
        },
      },
    );
    assert.notEqual(stdout, 'NoopTracerProvider\n');
    // Ni el aviso DEP0205 de module.register(): se usa module.registerHooks().
    assert.equal(stderr, '');
    // apagar() ha mandado lo que quedaba: el span, en protobuf, a la URL tal cual.
    assert.equal(recibidas.length, 1);
    assert.equal(recibidas[0]!.url, '/v1/traces');
    assert.equal(recibidas[0]!.tipo, 'application/x-protobuf');
    assert.ok(recibidas[0]!.cuerpo.includes('una-prueba'));
    assert.ok(recibidas[0]!.cuerpo.includes('tienda-prueba'));
  } finally {
    receptor.close();
  }
});
