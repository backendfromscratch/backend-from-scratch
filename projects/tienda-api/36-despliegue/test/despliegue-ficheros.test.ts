// Los ficheros del despliegue de la lección 6 (el workflow que publica la imagen y desplegar.sh con
// su temporizador), comprobados sobre su texto: sin GitHub ni Docker. Que funcionan lo enseñan las
// capturas de la lección, hechas en una máquina virtual con un registro local.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const flujo = readFileSync('.github/workflows/publicar.yml', 'utf8');

/** El texto de un trabajo del workflow: desde «  nombre:» hasta el siguiente trabajo. */
function trabajo(nombre: string): string {
  const desde = flujo.indexOf(`\n  ${nombre}:\n`);
  assert.notEqual(desde, -1, `no hay trabajo ${nombre}`);
  const resto = flujo.slice(desde + 1);
  const hasta = resto.slice(1).search(/\n {2}\S+:\n/);
  return hasta === -1 ? resto : resto.slice(0, hasta + 1);
}

test('el workflow fija cada acción por el SHA de su commit', () => {
  const usos = [...flujo.matchAll(/^\s+- uses: (\S+)/gm)].map((m) => m[1]!);
  assert.ok(usos.length >= 6, 'faltan acciones');
  for (const uso of usos) {
    assert.match(uso, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, uso);
  }
});

test('el workflow pide el mínimo: contents: read, y packages: write solo al publicar', () => {
  // Arriba del todo, para todos los trabajos.
  assert.match(flujo, /\npermissions:\n {2}contents: read\n\njobs:/);
  assert.ok(!trabajo('comprobar').includes('permissions:'));
  assert.match(trabajo('publicar'), /permissions:\n {6}contents: read\n {6}packages: write/);
  assert.equal(flujo.match(/packages: write/g)?.length, 1);
  // Cada checkout deja el token fuera de .git/config.
  const checkouts = flujo.match(/actions\/checkout@/g)?.length ?? 0;
  assert.equal(flujo.match(/persist-credentials: false/g)?.length, checkouts);
});

test('el workflow comprueba en los pull requests y publica solo después, en main', async () => {
  assert.match(flujo, /\non:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/);
  const publicar = trabajo('publicar');
  assert.match(publicar, /needs: comprobar/);
  assert.match(publicar, /if: \$\{\{ github\.event_name == 'push' \}\}/);
  const comprobar = trabajo('comprobar');
  assert.match(comprobar, /run: npm ci/);
  assert.match(comprobar, /run: npm run check/);
  assert.match(comprobar, /run: npm test/);
  // PostgreSQL 18 por su digest: el mismo que usa compose.produccion.yaml.
  const digest = /postgres:18@sha256:[0-9a-f]{64}/;
  assert.match(comprobar, digest);
  const compose = await readFile('compose.produccion.yaml', 'utf8');
  assert.equal(comprobar.match(digest)![0], compose.match(digest)![0]);
});

test('el workflow publica para amd64 y arm64, con las etiquetas sha-<corto> y main', () => {
  const publicar = trabajo('publicar');
  assert.match(publicar, /platforms: linux\/amd64,linux\/arm64/);
  assert.match(publicar, /type=sha,format=short/);
  assert.match(publicar, /type=raw,value=main/);
  // El nombre sale del propietario del repositorio, en minúsculas y sin escribirlo dentro del script.
  assert.match(publicar, /PROPIETARIO: \$\{\{ github\.repository_owner \}\}/);
  assert.match(publicar, /ghcr\.io\/\$\{PROPIETARIO,,\}\/tienda-api/);
  assert.ok(!/run:.*\$\{\{/.test(publicar), 'una expresión dentro de un run: es una inyección');
});

test('desplegar.sh: un solo despliegue, sin construir, y la copia antes de migrar', async () => {
  const script = await readFile('despliegue/desplegar.sh', 'utf8');
  assert.match(script, /^#!\/usr\/bin\/env bash\n/);
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /^exec 9>\/run\/lock\/tienda-despliegue\.lock$/m);
  assert.match(script, /^flock -n 9 \|\| exit 0$/m);
  // Nunca construye: cada up lleva --no-build.
  const ups = script.match(/^.*\bup -d\b.*$/gm) ?? [];
  assert.equal(ups.length, 2);
  for (const linea of ups) assert.match(linea, /--no-build/);
  // El orden: guardar la imagen que corre, preguntar al registro, copia, migraciones y API nueva.
  const orden = [
    'docker tag "$corriendo" "$anterior"',
    'pull --quiet api',
    'despliegue/copia-seguridad.sh',
    'run --rm migrar',
    'up -d --no-build api',
  ].map((trozo) => script.indexOf(trozo));
  assert.ok(!orden.includes(-1), orden.join());
  assert.deepEqual(
    orden,
    [...orden].sort((a, b) => a - b),
  );
  // La vuelta atrás usa la imagen guardada en el disco, sin volver a migrar.
  assert.match(script, /IMAGEN="\$anterior" "\$\{compose\[@\]\}" up -d --no-build --no-deps api/);
  // Sin novedades, en silencio: el ID de la imagen que corre contra el de la descargada.
  assert.match(script, /if \[ "\$nueva" = "\$corriendo" \]; then\n {2}exit 0/);
});

test('el temporizador mira cada dos minutos y el servicio es de una sola tarea', async () => {
  const temporizador = await readFile('despliegue/tienda-despliegue.timer', 'utf8');
  assert.match(temporizador, /^OnBootSec=1min$/m);
  assert.match(temporizador, /^OnUnitActiveSec=2min$/m);
  const servicio = await readFile('despliegue/tienda-despliegue.service', 'utf8');
  assert.match(servicio, /^Type=oneshot$/m);
  assert.match(servicio, /^ExecStart=\/opt\/tienda\/despliegue\/desplegar\.sh$/m);
});

test('la imagen no lleva el workflow ni la anotación del despliegue', async () => {
  const ignorados = (await readFile('.dockerignore', 'utf8')).split('\n');
  for (const nombre of ['.github', '.despliegue-fallido']) {
    assert.ok(ignorados.includes(nombre), nombre);
  }
  assert.ok((await readFile('.gitignore', 'utf8')).split('\n').includes('/.despliegue-fallido'));
});
