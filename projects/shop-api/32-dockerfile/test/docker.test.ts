// The rules of the Dockerfile and of .dockerignore that lesson 3 explains, checked on the files.
// That the image builds and starts is checked by CI with docker build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { test } from 'node:test';

/** The Dockerfile's instructions, without comments or blank lines. */
async function instructions(): Promise<string[]> {
  const text = await readFile('Dockerfile', 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

test(".dockerignore leaves out the secrets (.env) and your computer's dependencies", async () => {
  const ignored = (await readFile('.dockerignore', 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  assert.ok(ignored.includes('.env'));
  assert.ok(ignored.includes('node_modules'));
});

test('npm ci goes before copying the code, with package.json, package-lock.json and .npmrc', async () => {
  const lines = await instructions();
  const manifests = lines.indexOf('COPY package.json package-lock.json .npmrc ./');
  const install = lines.indexOf('RUN npm ci');
  const code = lines.indexOf('COPY . .');
  assert.ok(manifests !== -1 && install !== -1 && code !== -1, lines.join('\n'));
  assert.ok(manifests < install && install < code);
  // The starting image, pinned by its digest.
  assert.match(lines[0]!, /^FROM node:26-slim@sha256:[0-9a-f]{64}$/);
});

test("CMD in exec form, and the server listens on all the container's addresses", async () => {
  const lines = await instructions();
  assert.equal(lines.at(-1), 'CMD ["node", "src/server.ts"]');
  assert.ok(lines.includes('ENV HOST=0.0.0.0'));
});

test('with SIGTERM (docker stop), the server shuts down properly and right away', async () => {
  const free = createServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as { port: number }).port;
  free.close();
  const server = spawn('node', ['src/server.ts'], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'info' },
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  await once(server.stdout, 'data'); // the line "The shop is listening on…"
  const before = Date.now();
  server.kill('SIGTERM');
  const [code] = await once(server, 'exit');
  assert.equal(code, 0);
  assert.ok(Date.now() - before < 2000, 'without waiting to be killed');
  assert.match(output, /SIGTERM: the shop is shutting down/);
});
