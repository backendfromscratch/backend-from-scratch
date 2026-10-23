// The rules of compose.yaml that lesson 7 explains, checked on the file's text (without installing
// a YAML reader: looking for the lines is enough). That the shop starts with docker compose up is
// checked by CI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** The lines of compose.yaml, without comments or blank lines. */
async function lines(): Promise<string[]> {
  const text = await readFile('compose.yaml', 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''));
}

/** A service's lines: from "  name:" to the next service. */
async function service(name: string): Promise<string[]> {
  const all = await lines();
  const from = all.indexOf(`  ${name}:`);
  assert.notEqual(from, -1, `there is no ${name} service`);
  const to = all.findIndex((line, i) => i > from && /^ {0,2}\S/.test(line));
  return all.slice(from + 1, to);
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
  for (const name of ['db', 'redis', 'migrate', 'worker']) {
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
  assert.equal(images.length, 3);
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
  assert.ok(worker.includes("    command: ['node', 'scripts/worker.ts']"));
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
