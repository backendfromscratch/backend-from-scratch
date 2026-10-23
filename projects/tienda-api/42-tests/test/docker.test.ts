// Las reglas del Dockerfile y de .dockerignore que explican las lecciones 3 y 4, comprobadas sobre
// los ficheros, y la ruta /salud del HEALTHCHECK. Que la imagen se construye y arranca lo
// comprueba CI con docker build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { after, test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';

after(() => pool.end());

/** Las instrucciones del Dockerfile, sin comentarios ni líneas en blanco. */
async function instrucciones(): Promise<string[]> {
  const texto = await readFile('Dockerfile', 'utf8');
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '' && !linea.startsWith('#'));
}

/** Las instrucciones de una etapa: desde su FROM hasta el siguiente. */
async function etapa(nombre: string): Promise<string[]> {
  const lineas = await instrucciones();
  const desde = lineas.findIndex((l) => l.startsWith('FROM ') && l.endsWith(` AS ${nombre}`));
  assert.notEqual(desde, -1, `no hay etapa ${nombre}`);
  const hasta = lineas.findIndex((linea, i) => i > desde && linea.startsWith('FROM '));
  return lineas.slice(desde, hasta === -1 ? undefined : hasta);
}

/** Arranca src/servidor.ts en un puerto libre, con el entorno que se le dé. */
async function arrancar(entorno: Record<string, string>) {
  const libre = createServer().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as { port: number }).port;
  libre.close();
  const servidor = spawn('node', ['src/servidor.ts'], {
    env: { ...process.env, PORT: String(puerto), LOG_LEVEL: 'info', ...entorno },
  });
  let salida = '';
  servidor.stdout.on('data', (trozo) => (salida += trozo));
  await once(servidor.stdout, 'data'); // la línea «La tienda escucha en…»
  return { servidor, url: `http://127.0.0.1:${puerto}`, salida: () => salida };
}

test('.dockerignore deja fuera los secretos (.env) y las dependencias de tu ordenador', async () => {
  const ignorados = (await readFile('.dockerignore', 'utf8'))
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '' && !linea.startsWith('#'));
  assert.ok(ignorados.includes('.env'));
  assert.ok(ignorados.includes('node_modules'));
});

test('tres etapas: dependencias instala, comprobar revisa los tipos y la final toma su código', async () => {
  const dependencias = await etapa('dependencias');
  assert.match(dependencias[0]!, /^FROM node:26-slim@sha256:[0-9a-f]{64} AS dependencias$/);
  assert.deepEqual(dependencias.slice(2), [
    'COPY package.json package-lock.json .npmrc ./',
    'RUN npm ci',
  ]);
  assert.deepEqual(await etapa('comprobar'), [
    'FROM dependencias AS comprobar',
    'COPY . .',
    'RUN npm run check',
  ]);
  // Si la final no tomara nada de comprobar, BuildKit se saltaría esa etapa.
  assert.ok((await etapa('final')).includes('COPY --from=comprobar /app/src ./src'));
});

test('la imagen final: dependencias de producción, sin root, con HEALTHCHECK y CMD en forma exec', async () => {
  const final = await etapa('final');
  assert.match(final[0]!, /^FROM node:26-slim@sha256:[0-9a-f]{64} AS final$/);
  const manifiestos = final.indexOf('COPY package.json package-lock.json .npmrc ./');
  const instalar = final.findIndex((linea) => linea.startsWith('RUN npm ci --omit=dev'));
  assert.ok(manifiestos !== -1 && manifiestos < instalar);
  assert.ok(final.includes('USER node'));
  assert.ok(final.includes('ENV NODE_ENV=production HOST=0.0.0.0'));
  assert.ok(final.some((linea) => linea.startsWith('HEALTHCHECK ') && linea.includes('/salud')));
  assert.equal(final.at(-1), 'CMD ["node", "src/servidor.ts"]');
});

test('con SIGTERM (docker stop), el servidor se apaga bien y enseguida', async () => {
  const { servidor, salida } = await arrancar({});
  const antes = Date.now();
  servidor.kill('SIGTERM');
  const [codigo] = await once(servidor, 'exit');
  assert.equal(codigo, 0);
  assert.ok(Date.now() - antes < 2000, 'sin esperar a que lo maten');
  assert.match(salida(), /SIGTERM: la tienda se apaga/);
});

test('GET /salud: 200 {"estado":"ok"} cuando PostgreSQL contesta', async () => {
  const res = await app.request('/salud');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { estado: 'ok' });
});

test('GET /salud: 503 cuando PostgreSQL no contesta', async () => {
  // Un puerto en el que no escucha nadie: la conexión se rechaza al momento.
  const { servidor, url } = await arrancar({
    DATABASE_URL: 'postgres://tienda:tienda@127.0.0.1:1/tienda',
  });
  try {
    const res = await fetch(`${url}/salud`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal((await res.json()).detail, 'La base de datos no responde');
  } finally {
    servidor.kill();
    await once(servidor, 'exit');
  }
});
