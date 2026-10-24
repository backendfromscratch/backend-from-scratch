// Las reglas de compose.yaml que explica la lección 7, comprobadas sobre el texto del fichero (sin
// instalar un lector de YAML: basta con buscar las líneas). Que la tienda arranca con
// docker compose up lo comprueba CI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** Las líneas de compose.yaml (u otro fichero), sin comentarios ni líneas en blanco. */
async function lineas(fichero = 'compose.yaml'): Promise<string[]> {
  const texto = await readFile(fichero, 'utf8');
  return texto
    .split('\n')
    .filter((linea) => linea.trim() !== '' && !linea.trim().startsWith('#'))
    .map((linea) => linea.replace(/\s+#.*$/, ''));
}

/** Las líneas de un servicio: desde «  nombre:» hasta el siguiente servicio. */
async function servicio(nombre: string, fichero = 'compose.yaml'): Promise<string[]> {
  const todas = await lineas(fichero);
  const desde = todas.indexOf(`  ${nombre}:`);
  assert.notEqual(desde, -1, `no hay servicio ${nombre}`);
  const hasta = todas.findIndex((linea, i) => i > desde && /^ {0,2}\S/.test(linea));
  // El último servicio del fichero llega hasta el final.
  return todas.slice(desde + 1, hasta === -1 ? undefined : hasta);
}

test('db y redis tienen healthcheck, y la API espera a que estén sanos y a las migraciones', async () => {
  assert.ok((await servicio('db')).some((l) => l.includes("['CMD', 'pg_isready'")));
  assert.ok((await servicio('redis')).some((l) => l.includes("['CMD', 'redis-cli', 'ping']")));
  const api = (await servicio('api')).join('\n');
  assert.match(api, /db:\n\s+condition: service_healthy/);
  assert.match(api, /redis:\n\s+condition: service_healthy/);
  assert.match(api, /migrar:\n\s+condition: service_completed_successfully/);
  assert.match((await servicio('migrar')).join('\n'), /db:\n\s+condition: service_healthy/);
});

test('los puertos, solo en 127.0.0.1; la base de datos y Redis, sin publicar', async () => {
  const publicados = (await lineas()).filter((l) => /^\s+- '?[\d.:-]+:\d+'?$/.test(l));
  // La API y la bandeja de entrada de Mailpit (lección 1 de la Fase 9).
  assert.deepEqual(publicados, [
    "      - '127.0.0.1:3000-3001:3000'",
    "      - '127.0.0.1:8025:8025'",
  ]);
  for (const nombre of ['db', 'redis', 'cache', 'migrar', 'trabajador']) {
    assert.ok(!(await servicio(nombre)).some((l) => l.trim() === 'ports:'), nombre);
  }
});

test('ningún secreto escrito: las contraseñas llegan de .env', async () => {
  for (const linea of await lineas()) {
    // Una contraseña, sola (POSTGRES_PASSWORD: …) o dentro de una URL (usuario:contraseña@…).
    const sola = linea.match(/PASSWORD:\s*(.*)$/)?.[1];
    if (sola !== undefined) assert.match(sola, /^\$\{POSTGRES_PASSWORD[:?}]/, linea);
    const enUrl = linea.match(/\/\/[^:/\s]+:([^@\s]+)@/)?.[1];
    if (enUrl !== undefined) assert.equal(enUrl, '${POSTGRES_PASSWORD}', linea);
  }
  assert.ok((await servicio('api')).includes('    env_file: .env'));
});

test('las imágenes, fijadas por su digest', async () => {
  const imagenes = (await lineas()).filter((l) => l.trim().startsWith('image:'));
  assert.equal(imagenes.length, 4);
  for (const linea of imagenes) {
    assert.match(linea, /image: [\w/]+:[\w.]+@sha256:[0-9a-f]{64}$/);
  }
});

test('Redis guarda la cola en disco, y el trabajador es la imagen de la API con otro comando', async () => {
  // La cola no puede perder trabajos: Redis los escribe en disco (appendonly), en un volumen, y no
  // borra claves cuando se llena la memoria (noeviction), como pide BullMQ.
  const redis = (await servicio('redis')).join('\n');
  assert.match(
    redis,
    /command: \['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'\]/,
  );
  assert.match(redis, /volumes:\n\s+- redis:\/data/);
  const trabajador = await servicio('trabajador');
  assert.ok(trabajador.includes('    build: .'));
  // Con las trazas (Fase 10, lección 4): src/instrumentacion.ts, antes que el trabajador.
  assert.ok(
    trabajador.includes(
      "    command: ['node', '--import', './src/instrumentacion.ts', 'scripts/trabajador.ts']",
    ),
  );
  assert.ok(trabajador.includes('    env_file: .env'));
  // El mismo entorno que la API: la base de datos, Redis y Mailpit.
  const entorno = (lineas: string[]) =>
    lineas.filter((l) => /^ {6}[A-Z_]+: /.test(l) && !l.includes('condition'));
  assert.deepEqual(entorno(trabajador), entorno(await servicio('api')));
  assert.ok(entorno(trabajador).includes('      SMTP_URL: smtp://mailpit:1025'));
  // Su propio healthcheck: el fichero del latido, reciente (src/latido.ts).
  assert.ok(trabajador.some((l) => l.includes("statSync('/tmp/latido').mtimeMs < 30000")));
  assert.ok(!trabajador.some((l) => l.includes('disable: true')));
  // Cada segundo al empezar: sano en un segundo o dos, no tras el primer intervalo de 10 s.
  assert.ok(trabajador.includes('      start_interval: 1s'));
});

test('la caché es otro Redis: 64 MB, borra las claves menos usadas y no guarda nada en disco', async () => {
  // Lo contrario que la cola (Fase 9, lección 2): perder la caché no importa, se vuelve a llenar.
  const cache = (await servicio('cache')).join('\n');
  assert.match(cache, /image: redis:8@sha256:[0-9a-f]{64}/);
  // El comando, palabra a palabra (prettier lo escribe en varias líneas: es largo).
  const comando = cache.slice(cache.indexOf('command:')).split(']')[0]!;
  assert.deepEqual(
    [...comando.matchAll(/'([^']*)'/g)].map((palabra) => palabra[1]),
    [
      'redis-server',
      '--maxmemory',
      '64mb',
      '--maxmemory-policy',
      'allkeys-lru',
      '--save',
      '',
      '--appendonly',
      'no',
    ],
  );
  assert.doesNotMatch(cache, /volumes:/);
  assert.ok((await servicio('cache')).some((l) => l.includes("['CMD', 'redis-cli', 'ping']")));
  // La API la usa (CACHE_URL) y espera a que esté sana; el trabajador lleva el mismo entorno.
  const api = (await servicio('api')).join('\n');
  assert.match(api, /^ {6}CACHE_URL: redis:\/\/cache:6379$/m);
  assert.match(api, /cache:\n\s+condition: service_healthy/);
  assert.match((await servicio('trabajador')).join('\n'), /^ {6}CACHE_URL: redis:\/\/cache:6379$/m);
});

test('compose.observabilidad.yaml añade Jaeger, y la API y el trabajador le mandan las trazas', async () => {
  // Fase 10, lección 4. compose.yaml no cambia: sin este fichero, nadie manda trazas.
  assert.ok(!(await lineas()).some((l) => l.includes('OTEL_')));
  const fichero = 'compose.observabilidad.yaml';
  const jaeger = (await servicio('jaeger', fichero)).join('\n');
  assert.match(jaeger, /image: jaegertracing\/jaeger:2\.22\.0@sha256:[0-9a-f]{64}$/m);
  // Su web, solo en tu ordenador; el 4318 (OTLP), solo dentro de la red de Compose.
  assert.match(jaeger, /ports:\n\s+- '127\.0\.0\.1:16686:16686'$/m);
  assert.doesNotMatch(jaeger, /4317|4318/);
  assert.match(jaeger, /healthcheck:\n\s+test: \['CMD', 'wget', .*13133\/status'\]/);
  for (const [nombre, servicioOtel] of [
    ['api', 'tienda-api'],
    ['trabajador', 'tienda-trabajador'],
  ] as const) {
    const lineasServicio = (await servicio(nombre, fichero)).join('\n');
    assert.match(
      lineasServicio,
      /^ {6}OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http:\/\/jaeger:4318\/v1\/traces$/m,
    );
    assert.match(lineasServicio, new RegExp(`^ {6}OTEL_SERVICE_NAME: ${servicioOtel}$`, 'm'));
    assert.match(lineasServicio, /jaeger:\n\s+condition: service_healthy/);
  }
});

test('compose.observabilidad.yaml añade Prometheus y Grafana, y la API y el trabajador mandan las métricas', async () => {
  // Fase 10, lección 5. Sin este fichero, nadie manda métricas.
  const fichero = 'compose.observabilidad.yaml';
  const prometheus = (await servicio('prometheus', fichero)).join('\n');
  assert.match(prometheus, /image: prom\/prometheus:v3\.15\.0@sha256:[0-9a-f]{64}$/m);
  // Recibe por OTLP solo si se le pide, y su web, solo en tu ordenador.
  assert.match(prometheus, /- '--web\.enable-otlp-receiver'$/m);
  assert.match(prometheus, /ports:\n\s+- '127\.0\.0\.1:9090:9090'$/m);
  assert.match(prometheus, /- prometheus-datos:\/prometheus$/m);
  assert.match(prometheus, /healthcheck:\n\s+test: \['CMD', 'wget', .*9090\/-\/ready'\]/);
  const grafana = (await servicio('grafana', fichero)).join('\n');
  assert.match(grafana, /image: grafana\/grafana:13\.2\.4-slim@sha256:[0-9a-f]{64}$/m);
  // En el 3100: el 3000 es de la API. Solo en 127.0.0.1, que es lo que permite entrar sin contraseña.
  assert.match(grafana, /ports:\n\s+- '127\.0\.0\.1:3100:3000'$/m);
  assert.match(grafana, /GF_AUTH_ANONYMOUS_ENABLED: 'true'/);
  assert.match(
    grafana,
    /- \.\/observabilidad\/grafana\/provisioning:\/etc\/grafana\/provisioning:ro$/m,
  );
  assert.match(grafana, /- \.\/observabilidad\/grafana\/paneles:\/var\/lib\/grafana\/paneles:ro$/m);
  assert.match(grafana, /healthcheck:\n\s+test: \['CMD', 'wget', .*3000\/api\/health'\]/);
  for (const nombre of ['api', 'trabajador']) {
    const lineasServicio = (await servicio(nombre, fichero)).join('\n');
    // La URL entera de cada señal: la genérica añadiría /v1/metrics, que Prometheus no sirve.
    assert.match(
      lineasServicio,
      /^ {6}OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: http:\/\/prometheus:9090\/api\/v1\/otlp\/v1\/metrics$/m,
    );
    assert.doesNotMatch(lineasServicio, /OTEL_EXPORTER_OTLP_ENDPOINT/);
    assert.match(lineasServicio, /prometheus:\n\s+condition: service_healthy/);
  }
  // Los tres, sin reglas de alertas: llegan en la lección 6.
  assert.ok(!(await lineas(fichero)).some((l) => /alert/i.test(l)));
});

test('Grafana nace provisionada: Prometheus, Jaeger y el panel de la tienda, desde ficheros', async () => {
  const fuentes = await readFile(
    'observabilidad/grafana/provisioning/datasources/fuentes.yaml',
    'utf8',
  );
  assert.match(
    fuentes,
    /uid: prom\n\s+type: prometheus\n\s+access: proxy\n\s+url: http:\/\/prometheus:9090/,
  );
  assert.match(
    fuentes,
    /uid: jaeger\n\s+type: jaeger\n\s+access: proxy\n\s+url: http:\/\/jaeger:16686/,
  );
  const panel = JSON.parse(await readFile('observabilidad/grafana/paneles/tienda.json', 'utf8'));
  assert.equal(panel.uid, 'tienda');
  const consultas: string[] = panel.panels.flatMap((p: { targets: { expr: string }[] }) =>
    p.targets.map((t) => t.expr),
  );
  const todas = consultas.join('\n');
  // Los tres de RED, con la métrica de @hono/otel, y los de la tienda.
  assert.match(todas, /rate\(http_server_request_duration_seconds_count/);
  assert.match(todas, /http_response_status_code=~"5\.\."/);
  assert.match(todas, /histogram_quantile\(0\.99, .*http_server_request_duration_seconds_bucket/);
  assert.match(todas, /tienda_pedidos_pagados_total/);
  assert.match(todas, /tienda_cola_esperando/);
  assert.match(todas, /tienda_respuestas_fuera_de_contrato_total/);
  assert.equal(panel.panels.length, 6);
  // Cardinalidad: se agrupa por plantilla de ruta y por ruta del contrato, nunca por URL.
  assert.ok(!/http_url|url_full|url_path/.test(todas));
});
