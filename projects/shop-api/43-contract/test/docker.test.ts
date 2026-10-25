// The rules of the Dockerfile and of .dockerignore that lessons 3 and 4 explain, checked on the
// files, and the HEALTHCHECK's /health route. That the image builds and starts is checked by CI
// with docker build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { after, test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';

after(() => pool.end());

/** The Dockerfile's instructions, without comments or blank lines. */
async function instructions(): Promise<string[]> {
  const text = await readFile('Dockerfile', 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** A stage's instructions: from its FROM to the next one. */
async function stage(name: string): Promise<string[]> {
  const lines = await instructions();
  const from = lines.findIndex((l) => l.startsWith('FROM ') && l.endsWith(` AS ${name}`));
  assert.notEqual(from, -1, `there is no ${name} stage`);
  const to = lines.findIndex((line, i) => i > from && line.startsWith('FROM '));
  return lines.slice(from, to === -1 ? undefined : to);
}

/** Starts src/server.ts on a free port, with the environment it's given. */
async function start(environment: Record<string, string>) {
  const free = createServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as { port: number }).port;
  free.close();
  const server = spawn('node', ['src/server.ts'], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'info', ...environment },
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  await once(server.stdout, 'data'); // the line "The shop is listening on…"
  return { server, url: `http://127.0.0.1:${port}`, output: () => output };
}

test(".dockerignore leaves out the secrets (.env) and your computer's dependencies", async () => {
  const ignored = (await readFile('.dockerignore', 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  assert.ok(ignored.includes('.env'));
  assert.ok(ignored.includes('node_modules'));
});

test('three stages: dependencies installs, check checks the types and the final one takes its code', async () => {
  const dependencies = await stage('dependencies');
  assert.match(dependencies[0]!, /^FROM node:26-slim@sha256:[0-9a-f]{64} AS dependencies$/);
  assert.deepEqual(dependencies.slice(2), [
    'COPY package.json package-lock.json .npmrc ./',
    'RUN npm ci',
  ]);
  assert.deepEqual(await stage('check'), [
    'FROM dependencies AS check',
    'COPY . .',
    'RUN npm run check',
  ]);
  // If the final one took nothing from check, BuildKit would skip that stage.
  assert.ok((await stage('final')).includes('COPY --from=check /app/src ./src'));
});

test('the final image: production dependencies, no root, with HEALTHCHECK and CMD in exec form', async () => {
  const final = await stage('final');
  assert.match(final[0]!, /^FROM node:26-slim@sha256:[0-9a-f]{64} AS final$/);
  const manifests = final.indexOf('COPY package.json package-lock.json .npmrc ./');
  const install = final.findIndex((line) => line.startsWith('RUN npm ci --omit=dev'));
  assert.ok(manifests !== -1 && manifests < install);
  assert.ok(final.includes('USER node'));
  assert.ok(final.includes('ENV NODE_ENV=production HOST=0.0.0.0'));
  assert.ok(final.some((line) => line.startsWith('HEALTHCHECK ') && line.includes('/health')));
  assert.equal(final.at(-1), 'CMD ["node", "src/server.ts"]');
});

test('with SIGTERM (docker stop), the server shuts down properly and right away', async () => {
  const { server, output } = await start({});
  const before = Date.now();
  server.kill('SIGTERM');
  const [code] = await once(server, 'exit');
  assert.equal(code, 0);
  assert.ok(Date.now() - before < 2000, 'without waiting to be killed');
  assert.match(output(), /SIGTERM: the shop is shutting down/);
});

test('GET /health: 200 {"status":"ok"} when PostgreSQL replies', async () => {
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /health: 503 when PostgreSQL does not reply', async () => {
  // A port nobody listens on: the connection is refused at once.
  const { server, url } = await start({
    DATABASE_URL: 'postgres://shop:shop@127.0.0.1:1/shop',
  });
  try {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal((await res.json()).detail, 'The database is not responding');
  } finally {
    server.kill();
    await once(server, 'exit');
  }
});
