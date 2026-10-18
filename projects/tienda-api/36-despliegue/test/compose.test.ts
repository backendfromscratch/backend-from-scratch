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
  assert.deepEqual(publicados, ["      - '127.0.0.1:3000-3001:3000'"]);
  for (const nombre of ['db', 'redis', 'migrar']) {
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
  assert.equal(imagenes.length, 2);
  for (const linea of imagenes) assert.match(linea, /image: \w+:\d+@sha256:[0-9a-f]{64}$/);
});
