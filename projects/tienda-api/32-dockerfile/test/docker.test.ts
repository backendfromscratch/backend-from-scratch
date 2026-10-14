// Las reglas del Dockerfile y de .dockerignore que explica la lección 3, comprobadas sobre los
// ficheros. Que la imagen se construye y arranca lo comprueba CI con docker build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { test } from 'node:test';

/** Las instrucciones del Dockerfile, sin comentarios ni líneas en blanco. */
async function instrucciones(): Promise<string[]> {
  const texto = await readFile('Dockerfile', 'utf8');
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '' && !linea.startsWith('#'));
}

test('.dockerignore deja fuera los secretos (.env) y las dependencias de tu ordenador', async () => {
  const ignorados = (await readFile('.dockerignore', 'utf8'))
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '' && !linea.startsWith('#'));
  assert.ok(ignorados.includes('.env'));
  assert.ok(ignorados.includes('node_modules'));
});

test('npm ci va antes de copiar el código, con package.json, package-lock.json y .npmrc', async () => {
  const lineas = await instrucciones();
  const manifiestos = lineas.indexOf('COPY package.json package-lock.json .npmrc ./');
  const instalar = lineas.indexOf('RUN npm ci');
  const codigo = lineas.indexOf('COPY . .');
  assert.ok(manifiestos !== -1 && instalar !== -1 && codigo !== -1, lineas.join('\n'));
  assert.ok(manifiestos < instalar && instalar < codigo);
  // La imagen de partida, fijada por su digest.
  assert.match(lineas[0]!, /^FROM node:26-slim@sha256:[0-9a-f]{64}$/);
});

test('CMD en forma exec, y el servidor escucha en todas las direcciones del contenedor', async () => {
  const lineas = await instrucciones();
  assert.equal(lineas.at(-1), 'CMD ["node", "src/servidor.ts"]');
  assert.ok(lineas.includes('ENV HOST=0.0.0.0'));
});

test('con SIGTERM (docker stop), el servidor se apaga bien y enseguida', async () => {
  const libre = createServer().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as { port: number }).port;
  libre.close();
  const servidor = spawn('node', ['src/servidor.ts'], {
    env: { ...process.env, PORT: String(puerto), LOG_LEVEL: 'info' },
  });
  let salida = '';
  servidor.stdout.on('data', (trozo) => (salida += trozo));
  await once(servidor.stdout, 'data'); // la línea «La tienda escucha en…»
  const antes = Date.now();
  servidor.kill('SIGTERM');
  const [codigo] = await once(servidor, 'exit');
  assert.equal(codigo, 0);
  assert.ok(Date.now() - antes < 2000, 'sin esperar a que lo maten');
  assert.match(salida, /SIGTERM: la tienda se apaga/);
});
