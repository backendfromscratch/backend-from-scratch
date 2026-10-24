// The rules of compose.yaml that lesson 7 explains, checked on the file's text (without installing
// a YAML reader: looking for the lines is enough). That the shop starts with docker compose up is
// checked by CI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** The lines of compose.yaml (or another file), without comments or blank lines. */
async function lines(file = 'compose.yaml'): Promise<string[]> {
  const text = await readFile(file, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''));
}

/** A service's lines: from "  name:" to the next service. */
async function service(name: string, file = 'compose.yaml'): Promise<string[]> {
  const all = await lines(file);
  const from = all.indexOf(`  ${name}:`);
  assert.notEqual(from, -1, `there is no ${name} service`);
  const to = all.findIndex((line, i) => i > from && /^ {0,2}\S/.test(line));
  // The last service in the file goes up to the end.
  return all.slice(from + 1, to === -1 ? undefined : to);
}

test('db and redis have a healthcheck, and the API waits for them to be healthy and for the migrations', async () => {
  assert.ok((await service('db')).some((l) => l.includes("['CMD', 'pg_isready'")));
  assert.ok((await service('redis')).some((l) => l.includes("['CMD', 'redis-cli', 'ping']")));
  const api = (await service('api')).join('\n');
  assert.match(api, /db:\n\s+condition: service_healthy/);
  assert.match(api, /redis:\n\s+condition: service_healthy/);
  assert.match(api, /migrate:\n\s+condition: service_completed_successfully/);
  assert.match((await service('migrate')).join('\n'), /db:\n\s+condition: service_healthy/);
});

test('the ports, only on 127.0.0.1; the database and Redis, not published', async () => {
  const published = (await lines()).filter((l) => /^\s+- '?[\d.:-]+:\d+'?$/.test(l));
  // The API and Mailpit's inbox (Phase 9, lesson 1).
  assert.deepEqual(published, [
    "      - '127.0.0.1:3000-3001:3000'",
    "      - '127.0.0.1:8025:8025'",
  ]);
  for (const name of ['db', 'redis', 'cache', 'migrate', 'worker']) {
    assert.ok(!(await service(name)).some((l) => l.trim() === 'ports:'), name);
  }
});

test('no secret written down: the passwords come from .env', async () => {
  for (const line of await lines()) {
    // A password, on its own (POSTGRES_PASSWORD: …) or inside a URL (user:password@…).
    const alone = line.match(/PASSWORD:\s*(.*)$/)?.[1];
    if (alone !== undefined) assert.match(alone, /^\$\{POSTGRES_PASSWORD[:?}]/, line);
    const inUrl = line.match(/\/\/[^:/\s]+:([^@\s]+)@/)?.[1];
    if (inUrl !== undefined) assert.equal(inUrl, '${POSTGRES_PASSWORD}', line);
  }
  assert.ok((await service('api')).includes('    env_file: .env'));
});

test('the images, pinned by their digest', async () => {
  const images = (await lines()).filter((l) => l.trim().startsWith('image:'));
  assert.equal(images.length, 4);
  for (const line of images) {
    assert.match(line, /image: [\w/]+:[\w.]+@sha256:[0-9a-f]{64}$/);
  }
});

test("Redis keeps the queue on disk, and the worker is the API's image with another command", async () => {
  // The queue can't lose jobs: Redis writes them to disk (appendonly), in a volume, and doesn't
  // delete keys when the memory fills up (noeviction), as BullMQ asks.
  const redis = (await service('redis')).join('\n');
  assert.match(
    redis,
    /command: \['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'\]/,
  );
  assert.match(redis, /volumes:\n\s+- redis:\/data/);
  const worker = await service('worker');
  assert.ok(worker.includes('    build: .'));
  // With the traces (Phase 10, lesson 4): src/instrumentation.ts, before the worker.
  assert.ok(
    worker.includes(
      "    command: ['node', '--import', './src/instrumentation.ts', 'scripts/worker.ts']",
    ),
  );
  assert.ok(worker.includes('    env_file: .env'));
  // The same environment as the API: the database, Redis and Mailpit.
  const environment = (lines: string[]) =>
    lines.filter((l) => /^ {6}[A-Z_]+: /.test(l) && !l.includes('condition'));
  assert.deepEqual(environment(worker), environment(await service('api')));
  assert.ok(environment(worker).includes('      SMTP_URL: smtp://mailpit:1025'));
  // Its own healthcheck: the heartbeat file, recent (src/heartbeat.ts).
  assert.ok(worker.some((l) => l.includes("statSync('/tmp/heartbeat').mtimeMs < 30000")));
  assert.ok(!worker.some((l) => l.includes('disable: true')));
  // Every second at the start: healthy in a second or two, not after the first 10 s interval.
  assert.ok(worker.includes('      start_interval: 1s'));
});

test('the cache is another Redis: 64 MB, it deletes the least-used keys and keeps nothing on disk', async () => {
  // The opposite of the queue (Phase 9, lesson 2): losing the cache doesn't matter, it fills again.
  const cache = (await service('cache')).join('\n');
  assert.match(cache, /image: redis:8@sha256:[0-9a-f]{64}/);
  // The command, word by word (prettier writes it on several lines: it is long).
  const command = cache.slice(cache.indexOf('command:')).split(']')[0]!;
  assert.deepEqual(
    [...command.matchAll(/'([^']*)'/g)].map((word) => word[1]),
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
  assert.ok((await service('cache')).some((l) => l.includes("['CMD', 'redis-cli', 'ping']")));
  // The API uses it (CACHE_URL) and waits for it to be healthy; the worker has the same environment.
  const api = (await service('api')).join('\n');
  assert.match(api, /^ {6}CACHE_URL: redis:\/\/cache:6379$/m);
  assert.match(api, /cache:\n\s+condition: service_healthy/);
  assert.match((await service('worker')).join('\n'), /^ {6}CACHE_URL: redis:\/\/cache:6379$/m);
});

test('compose.observability.yaml adds Jaeger, and the API and the worker send it the traces', async () => {
  // Phase 10, lesson 4. compose.yaml doesn't change: without this file, nobody sends traces.
  assert.ok(!(await lines()).some((l) => l.includes('OTEL_')));
  const file = 'compose.observability.yaml';
  const jaeger = (await service('jaeger', file)).join('\n');
  assert.match(jaeger, /image: jaegertracing\/jaeger:2\.22\.0@sha256:[0-9a-f]{64}$/m);
  // Its web page, only on your computer; 4318 (OTLP), only inside Compose's network.
  assert.match(jaeger, /ports:\n\s+- '127\.0\.0\.1:16686:16686'$/m);
  assert.doesNotMatch(jaeger, /4317|4318/);
  assert.match(jaeger, /healthcheck:\n\s+test: \['CMD', 'wget', .*13133\/status'\]/);
  // With the limit of traces in memory, not the image's configuration.
  assert.match(jaeger, /command: \['--config', '\/etc\/jaeger\/config\.yaml'\]/);
  assert.match(await readFile('observability/jaeger.yaml', 'utf8'), /max_traces: \d+/);
  for (const [name, otelService] of [
    ['api', 'shop-api'],
    ['worker', 'shop-worker'],
  ] as const) {
    const serviceLines = (await service(name, file)).join('\n');
    assert.match(
      serviceLines,
      /^ {6}OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http:\/\/jaeger:4318\/v1\/traces$/m,
    );
    assert.match(serviceLines, new RegExp(`^ {6}OTEL_SERVICE_NAME: ${otelService}$`, 'm'));
    assert.match(serviceLines, /jaeger:\n\s+condition: service_healthy/);
  }
});

test('compose.observability.yaml adds Prometheus and Grafana, and the API and the worker send the metrics', async () => {
  // Phase 10, lesson 5. Without this file, nobody sends metrics.
  const file = 'compose.observability.yaml';
  const prometheus = (await service('prometheus', file)).join('\n');
  assert.match(prometheus, /image: prom\/prometheus:v3\.15\.0@sha256:[0-9a-f]{64}$/m);
  // It receives over OTLP only if asked to, and its web page, only on your computer.
  assert.match(prometheus, /- '--web\.enable-otlp-receiver'$/m);
  assert.match(prometheus, /ports:\n\s+- '127\.0\.0\.1:9090:9090'$/m);
  assert.match(prometheus, /- prometheus-data:\/prometheus$/m);
  assert.match(prometheus, /healthcheck:\n\s+test: \['CMD', 'wget', .*9090\/-\/ready'\]/);
  const grafana = (await service('grafana', file)).join('\n');
  assert.match(grafana, /image: grafana\/grafana:13\.2\.4-slim@sha256:[0-9a-f]{64}$/m);
  // On 3100: 3000 is the API's. Only on 127.0.0.1, which is what allows signing in without a password.
  assert.match(grafana, /ports:\n\s+- '127\.0\.0\.1:3100:3000'$/m);
  assert.match(grafana, /GF_AUTH_ANONYMOUS_ENABLED: 'true'/);
  // Only the Prometheus plugin: otherwise Grafana installs 18 and runs out of memory in 2 GiB.
  assert.match(grafana, /GF_PLUGINS_PREINSTALL_SYNC: prometheus$/m);
  assert.match(grafana, /GF_PLUGINS_DISABLE_PLUGINS: elasticsearch,.*,zipkin$/m);
  assert.match(grafana, /GOMEMLIMIT: 250MiB$/m);
  assert.match(
    grafana,
    /- \.\/observability\/grafana\/provisioning:\/etc\/grafana\/provisioning:ro$/m,
  );
  assert.match(
    grafana,
    /- \.\/observability\/grafana\/dashboards:\/var\/lib\/grafana\/dashboards:ro$/m,
  );
  assert.match(grafana, /healthcheck:\n\s+test: \['CMD', 'wget', .*3000\/api\/health'\]/);
  for (const name of ['api', 'worker']) {
    const serviceLines = (await service(name, file)).join('\n');
    // The whole URL of each signal: the generic one would add /v1/metrics, which Prometheus doesn't serve.
    assert.match(
      serviceLines,
      /^ {6}OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: http:\/\/prometheus:9090\/api\/v1\/otlp\/v1\/metrics$/m,
    );
    assert.doesNotMatch(serviceLines, /OTEL_EXPORTER_OTLP_ENDPOINT/);
    assert.match(serviceLines, /prometheus:\n\s+condition: service_healthy/);
  }
  // Since lesson 6, the alerts' emails: over SMTP to Mailpit, without STARTTLS.
  assert.match(grafana, /GF_SMTP_ENABLED: 'true'/);
  assert.match(grafana, /GF_SMTP_HOST: mailpit:1025$/m);
  assert.match(grafana, /GF_SMTP_STARTTLS_POLICY: NoStartTLS$/m);
  assert.match(grafana, /mailpit:\n\s+condition: service_started/);
});

test('Grafana is born with the four alerts, and emails whoever is on call', async () => {
  // Phase 10, lesson 6: in provisioning/alerting, which Grafana reads on startup.
  const folder = 'observability/grafana/provisioning/alerting';
  const rules = await readFile(`${folder}/rules.yaml`, 'utf8');
  const uids = ['shop-errors-5xx', 'shop-slowness-p99', 'shop-outbox-stuck', 'shop-api-no-data'];
  assert.deepEqual(
    [...rules.matchAll(/- uid: (\S+)$/gm)].map((m) => m[1]),
    uids,
  );
  // The thresholds, measured (the reasoning, in the file): 5%, 0.5 s, 120 s and 60 s.
  const thresholds = [...rules.matchAll(/type: gt, params: \[([\d.]+)\]/g)].map((m) => m[1]);
  assert.deepEqual(thresholds, ['0.05', '0.5', '120', '60']);
  assert.equal([...rules.matchAll(/^\s+for: 2m$/gm)].length, 2);
  // With no data, only the one that watches that the API keeps sending metrics alerts.
  const noData = [...rules.matchAll(/noDataState: (\w+)$/gm)].map((m) => m[1]);
  assert.deepEqual(noData, ['OK', 'OK', 'OK', 'Alerting']);
  assert.match(rules, /time\(\) - timestamp\(shop_outbox_age_seconds/);
  // What they look at: the API's job in Prometheus, /v2 and the age of the outgoing events.
  assert.match(rules, /http_response_status_code=~"5\.\."/);
  assert.match(rules, /http_route!="\/v2\/orders\/:id\/events"/);
  assert.match(rules, /max\(shop_outbox_age_seconds\{job="shop-api"\}\)/);
  const contact = await readFile(`${folder}/contact.yaml`, 'utf8');
  assert.match(contact, /name: on-call\n\s+receivers:\n(.*\n)*\s+type: email/);
  assert.match(contact, /addresses: oncall@shop\.example/);
  const policy = await readFile(`${folder}/policy.yaml`, 'utf8');
  assert.match(policy, /receiver: on-call$/m);
  assert.match(policy, /group_by: \['alertname'\]/);
  // Mailpit keeps up to 5000 emails: with npm run traffic, the alerts' ones aren't deleted.
  assert.match((await service('mailpit')).join('\n'), /MP_MAX_MESSAGES: '5000'$/m);
});

test("Grafana is born provisioned: Prometheus and the shop's dashboard, from files", async () => {
  const sources = await readFile(
    'observability/grafana/provisioning/datasources/datasources.yaml',
    'utf8',
  );
  assert.match(
    sources,
    /uid: prom\n\s+type: prometheus\n\s+access: proxy\n\s+url: http:\/\/prometheus:9090/,
  );
  // Without Jaeger: its connector doesn't talk to Jaeger 2.22. The traces, in Jaeger's web page.
  assert.doesNotMatch(sources, /^\s+type: jaeger$/m);
  const dashboard = JSON.parse(
    await readFile('observability/grafana/dashboards/shop.json', 'utf8'),
  );
  assert.equal(dashboard.uid, 'shop');
  const queries: string[] = dashboard.panels.flatMap((p: { targets: { expr: string }[] }) =>
    p.targets.map((t) => t.expr),
  );
  const all = queries.join('\n');
  // The three RED ones, with @hono/otel's metric, and the shop's.
  assert.match(all, /rate\(http_server_request_duration_seconds_count/);
  assert.match(all, /http_response_status_code=~"5\.\."/);
  assert.match(all, /histogram_quantile\(0\.99, .*http_server_request_duration_seconds_bucket/);
  assert.match(all, /shop_orders_paid_total/);
  assert.match(all, /shop_queue_waiting/);
  assert.match(all, /shop_responses_outside_contract_total/);
  assert.equal(dashboard.panels.length, 6);
  // Cardinality: grouped by route template and by contract route, never by URL.
  assert.ok(!/http_url|url_full|url_path/.test(all));
});
