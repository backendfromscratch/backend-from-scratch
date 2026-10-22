// Las reglas de compose.yaml que explica la lección 7, comprobadas sobre el texto del fichero (sin
// instalar un lector de YAML: basta con buscar las líneas). Que la tienda arranca con
// docker compose up lo comprueba CI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** Las líneas de compose.yaml, sin comentarios ni líneas en blanco. */
async function lineas(): Promise<string[]> {
  const texto = await readFile('compose.yaml', 'utf8');
  return texto
    .split('\n')
    .filter((linea) => linea.trim() !== '' && !linea.trim().startsWith('#'))
    .map((linea) => linea.replace(/\s+#.*$/, ''));
}

/** Las líneas de un servicio: desde «  nombre:» hasta el siguiente servicio. */
async function servicio(nombre: string): Promise<string[]> {
  const todas = await lineas();
  const desde = todas.indexOf(`  ${nombre}:`);
  assert.notEqual(desde, -1, `no hay servicio ${nombre}`);
  const hasta = todas.findIndex((linea, i) => i > desde && /^ {0,2}\S/.test(linea));
  return todas.slice(desde + 1, hasta);
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
  for (const nombre of ['db', 'redis', 'migrar', 'trabajador']) {
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
  assert.equal(imagenes.length, 3);
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
  assert.ok(trabajador.includes("    command: ['node', 'scripts/trabajador.ts']"));
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
