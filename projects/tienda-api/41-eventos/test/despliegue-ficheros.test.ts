// Los ficheros del despliegue de la lección 6 de la Fase 8 (el workflow que publica la imagen y
// desplegar.sh con su temporizador), comprobados sobre su texto: sin GitHub ni Docker. Desde la
// Fase 9 (lección 4), desplegar.sh también se ejecuta de verdad, con un docker de mentira
// (test/docker-falso.sh) delante en el PATH: así se ve en qué orden cambia las copias de la API y
// cómo vuelve atrás. Que funciona con Docker y nginx de verdad lo enseñan las capturas de las
// lecciones, hechas en una máquina virtual con un registro local.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const codigo = script.replace(/^\s*#.*$/gm, '');
  assert.match(script, /^#!\/usr\/bin\/env bash\n/);
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /^exec 9>\/run\/lock\/tienda-despliegue\.lock$/m);
  assert.match(script, /^flock -n 9 \|\| exit 0$/m);
  // Nunca construye: cada up lleva --no-build. Dos: los demás servicios, y cambiar (cada copia y el
  // trabajador, de uno en uno: nunca dos servicios de la API en la misma orden).
  const ups = codigo.match(/^.*\bup -d\b.*$/gm) ?? [];
  assert.equal(ups.length, 2);
  for (const linea of ups) assert.match(linea, /--no-build --no-deps/);
  assert.match(codigo, /^ {2}IMAGEN="\$2" "\$\{compose\[@\]\}" up -d --no-build --no-deps "\$1"/m);
  // El orden: guardar la imagen que corre, preguntar al registro, copia, migraciones y las copias.
  const orden = [
    'docker tag "$corriendo" "$anterior"',
    'pull --quiet api-a',
    'despliegue/copia-seguridad.sh',
    'run --rm migrar',
    'cambiar "$primera_copia" "$imagen"',
    'cambiar "$segunda_copia" "$imagen"',
    'cambiar trabajador "$imagen"',
    'docker image prune --force',
  ].map((trozo) => codigo.indexOf(trozo));
  assert.ok(!orden.includes(-1), orden.join());
  assert.deepEqual(
    orden,
    [...orden].sort((a, b) => a - b),
  );
  // Solo cuenta el contenedor del servicio, no los de un «compose run» (oneoff=False).
  assert.match(script, /label=com\.docker\.compose\.oneoff=False/);
  assert.ok(!/ps --all --quiet api/.test(codigo), 'ps incluye los de run');
  // La imagen se guarda como :anterior solo si el contenedor está sano.
  assert.match(script, /= healthy \]; then\n {2}docker tag "\$corriendo" "\$anterior"/);
  // Las comillas de IMAGEN="…" se quitan; una imagen fallida dice cómo reintentarla.
  assert.match(script, /imagen="\$\{imagen#\[\\"\\'\]\}"/);
  assert.match(script, /para reintentarla: rm \$PWD\/\.despliegue-fallido/);
  // La vuelta atrás usa la imagen guardada en el disco (cambiar, con $anterior), sin migrar.
  assert.match(codigo, /if ! cambiar "\$servicio" "\$anterior"; then/);
});

test('el despliegue actualiza también el trabajador, con la misma imagen y después de la API', async () => {
  const script = await readFile('despliegue/desplegar.sh', 'utf8');
  const codigo = script.replace(/^\s*#.*$/gm, '');
  // Si el trabajador no arranca con la imagen nueva, todo vuelve atrás: él y las dos copias.
  assert.match(
    codigo,
    /cambiar trabajador "\$imagen" \|\| volver trabajador "\$segunda_copia" "\$primera_copia"/,
  );
  // Los demás servicios (db, redis y, desde la lección 2, la caché), al día antes: un Redis que ha
  // cambiado (ahora guarda la cola en disco) se recrea, y uno nuevo (cache) arranca. Sin construir
  // y sin tocar la API.
  const otros = script.indexOf('up -d --no-build --no-deps db redis cache\n');
  assert.notEqual(otros, -1);
  assert.ok(otros < script.indexOf('run --rm migrar'));
  assert.ok(otros < script.indexOf('cambiar "$primera_copia" "$imagen"'));
  // El trabajador, con la imagen de la API y su propio comando; la imagen lo lleva dentro.
  const compose = await readFile('compose.produccion.yaml', 'utf8');
  const trabajador = compose.slice(compose.indexOf('\n  trabajador:\n'));
  assert.match(trabajador, /^ {4}image: \$\{IMAGEN:-tienda-api\}$/m);
  assert.match(trabajador, /^ {4}command: \['node', 'scripts\/trabajador\.ts'\]$/m);
  assert.match(await readFile('Dockerfile', 'utf8'), /scripts\/trabajador\.ts/);
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

// desplegar.sh, de verdad, en una carpeta temporal: el script, un .env con IMAGEN y una copia de
// seguridad de mentira. docker y sleep son los de test/: sleep no espera, solo se apunta. El
// servidor empieza con las dos copias de la API y el trabajador sanos, con la imagen vieja, y el
// registro tiene una nueva.
const VIEJA = 'sha256:vieja';
const NUEVA = 'sha256:nueva';
const IMAGEN = 'registro.example:5000/tienda-api:main';

interface Escenario {
  /** La imagen que trae el registro (por defecto, una nueva). */
  nueva?: string;
  /** Los servicios que corren al empezar (por defecto, api-a, api-b y trabajador). */
  servicios?: string[];
  /** La imagen con la que corre cada servicio al empezar (por defecto, la vieja). */
  imagenes?: Record<string, string>;
  /** Las etiquetas que ya hay en el servidor, además de main en la imagen vieja. */
  etiquetas?: Record<string, string>;
  /** Cuántos contenedores tiene el servicio api (por defecto, uno) y su puerto (127.0.0.1:3000). */
  apiVieja?: { copias?: number; puerto?: string };
  /** La salud de los contenedores nuevos con la imagen nueva (por defecto, healthy). */
  saludNueva?: string;
  /** La salud de los contenedores nuevos de un servicio con la imagen nueva (si no, saludNueva). */
  saludDe?: Record<string, string>;
  /** Si Docker pasa los puertos publicados por docker-proxy (su userland proxy, encendido). */
  dockerProxy?: boolean;
}

async function desplegar(escenario: Escenario = {}) {
  const carpeta = await mkdtemp(join(tmpdir(), 'desplegar-'));
  try {
    return await desplegarEn(carpeta, escenario);
  } finally {
    // Siempre, aunque el test falle: no deja carpetas en el directorio temporal.
    await rm(carpeta, { recursive: true, force: true });
  }
}

async function desplegarEn(carpeta: string, escenario: Escenario) {
  const estado = join(carpeta, 'estado');
  const bin = join(carpeta, 'bin');
  for (const sub of [
    'despliegue',
    'bin',
    'estado/etiquetas',
    'estado/contenedores',
    'estado/c',
    'estado/salud',
  ]) {
    await mkdir(join(carpeta, sub), { recursive: true });
  }
  // El script, tal cual, salvo el fichero de bloqueo: /run/lock no existe en macOS, y así dos
  // pasadas de los tests a la vez (dos carpetas) no se bloquean entre sí.
  const script = await readFile('despliegue/desplegar.sh', 'utf8');
  const bloqueo = '/run/lock/tienda-despliegue.lock';
  assert.ok(script.includes(`exec 9>${bloqueo}\n`));
  await writeFile(
    join(carpeta, 'despliegue/desplegar.sh'),
    script.replace(`exec 9>${bloqueo}\n`, `exec 9>${join(carpeta, 'bloqueo')}\n`),
  );
  await writeFile(join(carpeta, '.env'), `POSTGRES_PASSWORD=x\nIMAGEN=${IMAGEN}\n`);
  const ejecutables: Record<string, string> = {
    'despliegue/copia-seguridad.sh': '#!/bin/sh\necho "copia de seguridad" >> "$FALSO/ordenes"\n',
    'bin/sleep': '#!/bin/sh\necho "sleep $*" >> "$FALSO/ordenes"\n',
    // flock no viene en macOS; aquí siempre consigue el bloqueo (el de verdad, en el servidor).
    'bin/flock': '#!/bin/sh\nexit 0\n',
    // pgrep, para ver si hay un docker-proxy en los puertos de la API: el del escenario.
    'bin/pgrep': '#!/bin/sh\necho "pgrep $*" >> "$FALSO/ordenes"\n[ -f "$FALSO/docker-proxy" ]\n',
    'bin/docker': await readFile('test/docker-falso.sh', 'utf8'),
  };
  for (const [fichero, texto] of Object.entries(ejecutables)) {
    await writeFile(join(carpeta, fichero), texto);
    await chmod(join(carpeta, fichero), 0o755);
  }
  // El estado del servidor: la etiqueta main en la imagen vieja, que corre en cada servicio, sana.
  const etiquetasAntes = { [IMAGEN]: VIEJA, ...escenario.etiquetas };
  for (const [nombre, id] of Object.entries(etiquetasAntes)) {
    await writeFile(join(estado, 'etiquetas', nombre.replace(/[/:]/g, '_')), `${id}\n`);
  }
  await writeFile(join(estado, 'nueva'), `${escenario.nueva ?? NUEVA}\n`);
  for (const servicio of escenario.servicios ?? ['api-a', 'api-b', 'trabajador']) {
    const salud = servicio === 'trabajador' ? '' : 'healthy';
    const imagen = escenario.imagenes?.[servicio] ?? VIEJA;
    const copias = servicio === 'api' ? (escenario.apiVieja?.copias ?? 1) : 1;
    const ids = Array.from(
      { length: copias },
      (_, n) => `viejo-${servicio}${n ? `-${n + 1}` : ''}`,
    );
    for (const id of ids) {
      const puerto = servicio === 'api' ? (escenario.apiVieja?.puerto ?? '127.0.0.1:3000') : '';
      await writeFile(
        join(estado, 'c', id),
        `imagen=${imagen}\nestado=running\nsalud=${salud}\npuerto=${puerto}\n`,
      );
    }
    await writeFile(join(estado, 'contenedores', servicio), `${ids.join('\n')}\n`);
  }
  if (escenario.dockerProxy) await writeFile(join(estado, 'docker-proxy'), '');
  if (escenario.saludNueva) {
    await writeFile(join(estado, 'salud', 'nueva'), `${escenario.saludNueva}\n`);
  }
  for (const [servicio, salud] of Object.entries(escenario.saludDe ?? {})) {
    await writeFile(join(estado, 'salud', `nueva-${servicio}`), `${salud}\n`);
  }

  const resultado = spawnSync('bash', [join(carpeta, 'despliegue/desplegar.sh')], {
    env: { PATH: `${bin}:${process.env.PATH}`, FALSO: estado },
    encoding: 'utf8',
  });
  const ordenes = (await readFile(join(estado, 'ordenes'), 'utf8').catch(() => ''))
    .trim()
    .split('\n')
    .filter(Boolean);
  // Cómo queda el servidor: el contenedor de cada servicio, con su imagen, y cada etiqueta.
  const contenedores = new Map<string, { id: string; imagen: string }>();
  for (const servicio of await readdir(join(estado, 'contenedores'))) {
    const id = (await readFile(join(estado, 'contenedores', servicio), 'utf8')).trim();
    const datos = await readFile(join(estado, 'c', id.split('\n')[0]!), 'utf8');
    contenedores.set(servicio, { id, imagen: datos.match(/^imagen=(.*)$/m)![1]! });
  }
  const etiquetas = new Map<string, string>();
  for (const nombre of await readdir(join(estado, 'etiquetas'))) {
    etiquetas.set(nombre, (await readFile(join(estado, 'etiquetas', nombre), 'utf8')).trim());
  }
  const fallida = await readFile(join(carpeta, '.despliegue-fallido'), 'utf8').catch(() => '');
  return {
    ...resultado,
    ordenes,
    contenedor: (servicio: string) => contenedores.get(servicio),
    etiqueta: (nombre: string) => etiquetas.get(nombre.replace(/[/:]/g, '_')),
    fallida: fallida.trim(),
  };
}

/** Las órdenes que arrancan la API o el trabajador (no db, redis ni cache), en orden. */
const arranques = (ordenes: string[]) =>
  ordenes
    .filter((o) => / up -d /.test(o) && !/ db redis cache$/.test(o))
    .map((o) =>
      o.replace(`docker compose -f compose.produccion.yaml up -d --no-build --no-deps `, ''),
    );

test('despliega api-a y api-b de una en una', async () => {
  const d = await desplegar();
  assert.equal(d.status, 0, d.stderr);
  // Primero api-b, después api-a, y al final el trabajador: cada uno, una orden, con la imagen nueva.
  assert.deepEqual(arranques(d.ordenes), [
    `IMAGEN=${IMAGEN} api-b`,
    `IMAGEN=${IMAGEN} api-a`,
    `IMAGEN=${IMAGEN} trabajador`,
  ]);
  const i = (trozo: string) => d.ordenes.findIndex((o) => o.includes(trozo));
  // La copia de seguridad y las migraciones, antes de tocar ninguna copia.
  assert.ok(i('copia de seguridad') < i('run --rm migrar'));
  assert.ok(i('run --rm migrar') < i('up -d --no-build --no-deps api-b'));
  // Entre una copia y la otra: Docker dice que api-b está sana, y una pausa de 10 s para nginx.
  const b = i('up -d --no-build --no-deps api-b');
  const a = i('up -d --no-build --no-deps api-a');
  const sana = d.ordenes.findIndex(
    (o, n) => n > b && o.startsWith('docker inspect') && o.endsWith('api-b'),
  );
  assert.ok(b < sana && sana < a, d.ordenes.join('\n'));
  assert.ok(d.ordenes.slice(sana, a).includes('sleep 10'), d.ordenes.join('\n'));
  for (const servicio of ['api-a', 'api-b', 'trabajador']) {
    assert.equal(d.contenedor(servicio)?.imagen, NUEVA, servicio);
  }
  assert.equal(d.fallida, '');
  assert.match(d.stdout, /hecho/);
});

test('si la primera copia nueva no está sana, vuelve atrás sin tocar la segunda', async () => {
  const d = await desplegar({ saludNueva: 'unhealthy' });
  assert.equal(d.status, 1);
  // api-b, con la nueva; no está sana: api-b otra vez, con la que corría (guardada como :anterior).
  assert.deepEqual(arranques(d.ordenes), [
    `IMAGEN=${IMAGEN} api-b`,
    'IMAGEN=registro.example:5000/tienda-api:anterior api-b',
  ]);
  assert.equal(d.contenedor('api-b')?.imagen, VIEJA);
  // api-a y el trabajador, los mismos contenedores de antes: nadie los ha tocado.
  assert.deepEqual(d.contenedor('api-a'), { id: 'viejo-api-a', imagen: VIEJA });
  assert.deepEqual(d.contenedor('trabajador'), { id: 'viejo-trabajador', imagen: VIEJA });
  // La imagen fallida queda apuntada, para no volver a probarla cada dos minutos.
  assert.equal(d.fallida, NUEVA);
  assert.match(d.stderr, /vuelvo a/);
});

test('si la segunda copia nueva no está sana, vuelven las dos, de una en una', async () => {
  const d = await desplegar({ saludDe: { 'api-a': 'unhealthy' } });
  assert.equal(d.status, 1);
  // La primera y la segunda con la nueva; después, las dos con la anterior: primero la que no
  // arrancó (api-a), mientras api-b atiende, y después api-b. El trabajador, sin tocar.
  assert.deepEqual(arranques(d.ordenes), [
    `IMAGEN=${IMAGEN} api-b`,
    `IMAGEN=${IMAGEN} api-a`,
    'IMAGEN=registro.example:5000/tienda-api:anterior api-a',
    'IMAGEN=registro.example:5000/tienda-api:anterior api-b',
  ]);
  assert.equal(d.contenedor('api-b')?.imagen, VIEJA);
  assert.deepEqual(d.contenedor('trabajador'), { id: 'viejo-trabajador', imagen: VIEJA });
  assert.equal(d.fallida, NUEVA);
});

test('deja de esperar en cuanto el contenedor está unhealthy', async () => {
  // Unhealthy: Docker ya ha dado la copia por mala; no hay nada que esperar.
  const mala = await desplegar({ saludNueva: 'unhealthy' });
  const volverB = (o: string) =>
    o.startsWith('IMAGEN=registro.example:5000/tienda-api:anterior ') && o.endsWith(' api-b');
  const vuelta = mala.ordenes.findIndex(volverB);
  assert.notEqual(vuelta, -1);
  assert.equal(mala.ordenes.slice(0, vuelta).filter((o) => o === 'sleep 2').length, 0);
  // Mientras está starting, sí espera: hasta 60 segundos, 30 veces 2 s.
  const lenta = await desplegar({ saludNueva: 'starting' });
  assert.equal(lenta.status, 1);
  const vueltaLenta = lenta.ordenes.findIndex(volverB);
  assert.equal(lenta.ordenes.slice(0, vueltaLenta).filter((o) => o === 'sleep 2').length, 30);
});

test('borra las imágenes más viejas que la anterior', async () => {
  const d = await desplegar();
  assert.equal(d.status, 0, d.stderr);
  // Al final, con todo sano: docker image prune borra las imágenes sin etiqueta. Quedan la nueva
  // (main, y la usan los contenedores) y la anterior (:anterior, por si hay que volver); las más
  // viejas perdieron su última etiqueta cuando :anterior pasó a otra.
  const podar = d.ordenes.findIndex((o) => o.startsWith('docker image prune'));
  assert.equal(d.ordenes[podar], 'docker image prune --force');
  assert.ok(podar > d.ordenes.findIndex((o) => o.includes('--no-deps trabajador')));
  assert.equal(d.etiqueta('registro.example:5000/tienda-api:anterior'), VIEJA);
  assert.equal(d.etiqueta(IMAGEN), NUEVA);
  // Si algo falla, no borra nada: las imágenes ayudan a ver qué ha pasado.
  const mala = await desplegar({ saludNueva: 'unhealthy' });
  assert.ok(!mala.ordenes.some((o) => o.includes('image prune')));
});

test('la primera vez, la API de una sola copia (servicio api) sigue hasta que api-b está sana', async () => {
  // Un servidor que viene del paso 39: una sola copia, el servicio api, en el puerto 3000.
  const d = await desplegar({ servicios: ['api', 'trabajador'] });
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(arranques(d.ordenes), [
    `IMAGEN=${IMAGEN} api-b`,
    `IMAGEN=${IMAGEN} api-a`,
    `IMAGEN=${IMAGEN} trabajador`,
  ]);
  // api-b (puerto 3001, libre) arranca mientras la vieja atiende; la vieja se para (SIGTERM) y se
  // borra justo antes de api-a, que necesita su puerto.
  const i = (orden: string) => d.ordenes.indexOf(orden);
  assert.ok(
    i(
      `IMAGEN=${IMAGEN} docker compose -f compose.produccion.yaml up -d --no-build --no-deps api-b`,
    ) < i('docker stop viejo-api'),
  );
  assert.ok(i('docker stop viejo-api') < i('docker rm viejo-api'));
  assert.ok(
    i('docker rm viejo-api') <
      i(
        `IMAGEN=${IMAGEN} docker compose -f compose.produccion.yaml up -d --no-build --no-deps api-a`,
      ),
  );
  assert.equal(d.contenedor('api'), undefined);
  // La imagen que corría en la vieja es la anterior.
  assert.equal(d.etiqueta('registro.example:5000/tienda-api:anterior'), VIEJA);
});

test('sin imagen nueva, no hace nada y no escribe nada', async () => {
  const d = await desplegar({ nueva: VIEJA });
  assert.equal(d.status, 0, d.stderr);
  assert.equal(d.stdout, '');
  assert.deepEqual(arranques(d.ordenes), []);
});

test('un despliegue cortado a medias (el trabajador con la vieja): lo termina y no toca :anterior', async () => {
  // Un reinicio o un systemctl stop entre api-a y el trabajador: las copias corren la nueva, el
  // trabajador la vieja, y :anterior sigue en la vieja, la de verdad anterior.
  const anterior = 'registro.example:5000/tienda-api:anterior';
  const d = await desplegar({
    imagenes: { 'api-a': NUEVA, 'api-b': NUEVA },
    etiquetas: { [IMAGEN]: NUEVA, [anterior]: VIEJA },
  });
  assert.equal(d.status, 0, d.stderr);
  // No es «sin novedades»: el trabajador va con otra imagen. El despliegue sigue hasta el final.
  assert.deepEqual(arranques(d.ordenes).at(-1), `IMAGEN=${IMAGEN} trabajador`);
  assert.equal(d.contenedor('trabajador')?.imagen, NUEVA);
  // :anterior no se mueve a la nueva: si no, la vieja se quedaría sin etiqueta y prune la borraría.
  assert.equal(d.etiqueta(anterior), VIEJA);
  assert.ok(!d.ordenes.some((o) => o.startsWith('docker tag')), d.ordenes.join('\n'));
});

test('la API de una sola copia en varias copias (--scale): no toca nada y lo dice', async () => {
  const d = await desplegar({ servicios: ['api', 'trabajador'], apiVieja: { copias: 2 } });
  assert.equal(d.status, 1);
  assert.match(d.stderr, /2 contenedores del servicio api/);
  assert.deepEqual(arranques(d.ordenes), []);
  assert.ok(!d.ordenes.some((o) => o.includes('pull')));
});

test('la primera vez, con la API de una sola copia en el 3001: primero api-a, después api-b', async () => {
  // El rango 3000-3001 del paso 39 movía la copia única de un puerto al otro en cada despliegue.
  // En el 3001, el puerto libre es el de api-a: arranca primero, y la vieja deja el suyo a api-b.
  const d = await desplegar({
    servicios: ['api', 'trabajador'],
    apiVieja: { puerto: '127.0.0.1:3001' },
  });
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(arranques(d.ordenes), [
    `IMAGEN=${IMAGEN} api-a`,
    `IMAGEN=${IMAGEN} api-b`,
    `IMAGEN=${IMAGEN} trabajador`,
  ]);
  const i = (orden: string) => d.ordenes.indexOf(orden);
  const up = (servicio: string) =>
    i(
      `IMAGEN=${IMAGEN} docker compose -f compose.produccion.yaml up -d --no-build --no-deps ${servicio}`,
    );
  assert.ok(up('api-a') < i('sleep 10'));
  assert.ok(i('sleep 10') < i('docker stop viejo-api'));
  assert.ok(i('docker stop viejo-api') < i('docker rm viejo-api'));
  assert.ok(i('docker rm viejo-api') < up('api-b'));
  assert.equal(d.contenedor('api'), undefined);
  assert.equal(d.contenedor('api-a')?.imagen, NUEVA);
  assert.equal(d.contenedor('api-b')?.imagen, NUEVA);
});

test('si api-a no está sana en esa primera vez (vieja en el 3001), vuelve atrás sin tocar la vieja', async () => {
  const d = await desplegar({
    servicios: ['api', 'trabajador'],
    apiVieja: { puerto: '127.0.0.1:3001' },
    saludNueva: 'unhealthy',
  });
  assert.equal(d.status, 1);
  assert.deepEqual(arranques(d.ordenes), [
    `IMAGEN=${IMAGEN} api-a`,
    'IMAGEN=registro.example:5000/tienda-api:anterior api-a',
  ]);
  assert.ok(!d.ordenes.some((o) => o.startsWith('docker stop')));
  assert.equal(d.contenedor('api')?.id, 'viejo-api');
});

test('la API de una sola copia en otro puerto: no toca nada y lo dice', async () => {
  const d = await desplegar({
    servicios: ['api', 'trabajador'],
    apiVieja: { puerto: '0.0.0.0:3000' },
  });
  assert.equal(d.status, 1);
  assert.match(d.stderr, /ni en el 3000 ni en el 3001/);
  assert.deepEqual(arranques(d.ordenes), []);
});

test('avisa si Docker pasa los puertos de la API por docker-proxy, y despliega igual', async () => {
  // Con docker-proxy, el puerto de una copia que se apaga acepta la conexión y la corta: nginx no
  // repite un POST ya enviado. Sin él (la lección lo apaga), la conexión se rechaza.
  const con = await desplegar({ dockerProxy: true });
  assert.equal(con.status, 0, con.stderr);
  assert.match(con.stderr, /userland-proxy/);
  assert.equal(con.contenedor('api-a')?.imagen, NUEVA);
  const sin = await desplegar();
  assert.doesNotMatch(sin.stderr, /userland-proxy/);
  // Sin novedades, ni eso: en silencio.
  const nada = await desplegar({ nueva: VIEJA, dockerProxy: true });
  assert.equal(nada.stderr, '');
  assert.equal(nada.stdout, '');
});
