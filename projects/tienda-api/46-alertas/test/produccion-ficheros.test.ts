// Los ficheros de producción de la lección 4 (compose.produccion.yaml, nginx/tienda.conf,
// .env.produccion.ejemplo y la copia de seguridad), comprobados sobre su texto: sin Docker ni nginx.
// Que arrancan y funcionan juntos lo enseñan las capturas de las lecciones, hechas en una máquina
// virtual con Ubuntu.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** Un fichero, sin comentarios (# …) ni líneas en blanco. */
async function sinComentarios(fichero: string): Promise<string[]> {
  const texto = await readFile(fichero, 'utf8');
  return texto
    .split('\n')
    .map((linea) => linea.replace(/(^|\s)#.*$/, '').trimEnd())
    .filter((linea) => linea.trim() !== '');
}

/** Las líneas de un servicio de compose.produccion.yaml: desde «  nombre:» hasta el siguiente. */
async function servicio(nombre: string): Promise<string[]> {
  const todas = await sinComentarios('compose.produccion.yaml');
  const desde = todas.indexOf(`  ${nombre}:`);
  assert.notEqual(desde, -1, `no hay servicio ${nombre}`);
  const hasta = todas.findIndex((linea, i) => i > desde && /^ {0,2}\S/.test(linea));
  return todas.slice(desde + 1, hasta === -1 ? undefined : hasta);
}

/**
 * Lo que comparten las dos copias de la API: el bloque x-api: &api de compose.produccion.yaml, con
 * dos espacios menos, para que se lea como las líneas de un servicio.
 */
async function ancla(): Promise<string[]> {
  const todas = await sinComentarios('compose.produccion.yaml');
  const desde = todas.indexOf('x-api: &api');
  assert.notEqual(desde, -1, 'no hay x-api: &api');
  const hasta = todas.findIndex((linea, i) => i > desde && /^\S/.test(linea));
  return todas.slice(desde + 1, hasta).map((linea) => `  ${linea}`);
}

test('compose.produccion.yaml no publica db ni redis, y la API solo en 127.0.0.1', async () => {
  const publicados = (await sinComentarios('compose.produccion.yaml')).filter((l) =>
    /^\s+- '?[\d.:-]+:\d+'?$/.test(l),
  );
  assert.deepEqual(publicados, ["      - '127.0.0.1:3000:3000'", "      - '127.0.0.1:3001:3000'"]);
  for (const nombre of ['db', 'redis', 'cache', 'migrar', 'trabajador']) {
    assert.ok(!(await servicio(nombre)).some((l) => l.trim() === 'ports:'), nombre);
  }
  // Los que han de volver solos después de un reinicio del servidor (la API, las dos copias).
  for (const nombre of ['db', 'redis', 'cache', 'trabajador']) {
    assert.ok((await servicio(nombre)).includes('    restart: unless-stopped'), nombre);
  }
  assert.ok((await ancla()).includes('    restart: unless-stopped'));
});

test('producción: dos copias de la API, api-a en el 3000 y api-b en el 3001, con todo lo demás igual', async () => {
  // Cada copia: el ancla y su puerto, nada más. Son los dos puertos del upstream de nginx.
  assert.deepEqual(await servicio('api-a'), [
    '    <<: *api',
    '    ports:',
    "      - '127.0.0.1:3000:3000'",
  ]);
  assert.deepEqual(await servicio('api-b'), [
    '    <<: *api',
    '    ports:',
    "      - '127.0.0.1:3001:3000'",
  ]);
  const nginx = (await sinComentarios('nginx/tienda.conf')).join('\n');
  assert.match(nginx, /server 127\.0\.0\.1:3000 /);
  assert.match(nginx, /server 127\.0\.0\.1:3001 /);
  // Ya no hay servicio api (el de una sola copia, hasta el paso 39).
  assert.ok(!(await sinComentarios('compose.produccion.yaml')).includes('  api:'));
  // docker stop espera 10 s antes de matarla, y la API se apaga en 8 como mucho.
  assert.ok((await ancla()).includes('    stop_grace_period: 10s'));
  const servidor = await readFile('src/servidor.ts', 'utf8');
  assert.match(servidor, /await apagar\(servidor, recursos, 8000\);/);
});

test('al apagarse, la API para el repartidor, cierra PostgreSQL, después Redis y al final las trazas', async () => {
  // El repartidor (sin Redis, lo lleva la API), que usa PostgreSQL; después PostgreSQL, y después
  // Redis: la cola, los avisos de los pedidos, la caché y los límites. Desde la Fase 10 (lección 4),
  // lo último, las trazas: los spans de las últimas peticiones.
  const servidor = await readFile('src/servidor.ts', 'utf8');
  const recursos = servidor.match(/^const recursos = \[\n([^\]]*)\];$/m);
  assert.ok(recursos, 'falta const recursos = [ … ]');
  assert.deepEqual(
    recursos[1]!
      .split('\n')
      .map((linea) => linea.trim())
      .filter(Boolean),
    [
      '{ cerrar: async () => repartidor?.parar() },',
      '{ cerrar: () => pool.end() },',
      '{ cerrar: cerrarCola },',
      'cambiosDePedidos,',
      'cache,',
      '{ cerrar: cerrarLimites },',
      '{ cerrar: () => instrumentacion.apagar() },',
    ],
  );
});

test('la imagen de la API, de migrar y del trabajador es la misma: build y ${IMAGEN:-tienda-api}', async () => {
  for (const [nombre, lineas] of [
    ['api', await ancla()],
    ['migrar', await servicio('migrar')],
    ['trabajador', await servicio('trabajador')],
  ] as const) {
    assert.ok(lineas.includes('    build: .'), nombre);
    assert.ok(lineas.includes('    image: ${IMAGEN:-tienda-api}'), nombre);
  }
});

test('producción: Redis guarda la cola en disco, sin Mailpit, y SMTP_URL solo de .env', async () => {
  const redis = (await servicio('redis')).join('\n');
  assert.match(
    redis,
    /command: \['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'\]/,
  );
  assert.match(redis, /volumes:\n\s+- redis:\/data/);
  const compose = (await sinComentarios('compose.produccion.yaml')).join('\n');
  assert.ok(!compose.includes('mailpit'), 'Mailpit es solo para tu ordenador');
  // SMTP_URL no se escribe en el Compose: llega de .env, y sin ella no se manda ningún correo.
  assert.ok(!compose.includes('SMTP_URL'));
  assert.ok((await servicio('trabajador')).includes('    env_file: .env'));
  // El trabajador, con el healthcheck de su latido, como en compose.yaml.
  const trabajador = await servicio('trabajador');
  assert.ok(trabajador.some((l) => l.includes("statSync('/tmp/latido').mtimeMs < 30000")));
  assert.ok(!trabajador.some((l) => l.includes('disable: true')));
  assert.ok(trabajador.includes('      start_interval: 1s'));
  assert.match(await readFile('.env.produccion.ejemplo', 'utf8'), /^# SMTP_URL=smtps:\/\//m);
});

test('producción: la caché, otro Redis sin disco, y CACHE_URL para la API y el trabajador', async () => {
  const cache = (await servicio('cache')).join('\n');
  // El comando, palabra a palabra (prettier lo escribe en varias líneas: es largo).
  const comando = cache.slice(cache.indexOf('command:')).split(']')[0]!;
  assert.deepEqual(
    [...comando.matchAll(/'([^']*)'/g)].map((palabra) => palabra[1]),
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
  assert.ok((await ancla()).includes('      CACHE_URL: redis://cache:6379'));
  assert.ok((await servicio('trabajador')).includes('      CACHE_URL: redis://cache:6379'));
  assert.match(await readFile('.env.produccion.ejemplo', 'utf8'), /CACHE_URL/);
});

test('la red de Compose tiene la subred fija en la que se apoya PROXY_CONFIABLE', async () => {
  const compose = (await sinComentarios('compose.produccion.yaml')).join('\n');
  assert.match(
    compose,
    /networks:\n {2}default:\n {4}ipam:\n {6}config:\n {8}- subnet: 172\.18\.0\.0\/16/,
  );
  const proxy = (await sinComentarios('.env.produccion.ejemplo')).find((l) =>
    l.startsWith('PROXY_CONFIABLE='),
  );
  assert.equal(proxy, 'PROXY_CONFIABLE=172.18.0.1');
});

test('migrar no carga las cuentas de práctica', async () => {
  const migrar = (await servicio('migrar')).join('\n');
  assert.match(migrar, /node scripts\/cargar-datos\.ts --sin-cuentas/);
  assert.ok(!/cargar-datos\.ts(?! --sin-cuentas)/.test(migrar));
});

test('nginx pasa X-Forwarded-For y X-Forwarded-Proto y desactiva el buffering en la ruta de eventos', async () => {
  const nginx = (await sinComentarios('nginx/tienda.conf')).join('\n');
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  // La ruta de eventos tiene su location, con el buffering apagado y una espera larga.
  const eventos = nginx.match(/location ~ \^\/v2\/pedidos\/\[\^\/\]\+\/eventos\$ \{([^}]*)\}/);
  assert.ok(eventos, 'falta el location de /v2/pedidos/:id/eventos');
  assert.match(eventos[1]!, /proxy_buffering off;/);
  assert.match(eventos[1]!, /proxy_read_timeout 1h;/);
  // Las dos copias de la API, con comprobación pasiva (max_fails y fail_timeout).
  assert.match(nginx, /server 127\.0\.0\.1:3000 max_fails=1 fail_timeout=\d+s;/);
  assert.match(nginx, /server 127\.0\.0\.1:3001 max_fails=1 fail_timeout=\d+s;/);
  // El 80 solo redirige, salvo el reto de Let's Encrypt.
  assert.match(nginx, /location \/\.well-known\/acme-challenge\/ \{/);
  assert.match(nginx, /return 301 https:\/\/\$host\$request_uri;/);
});

/** Los ajustes sin comentar de .env.produccion.ejemplo, como un objeto. */
async function ejemplo(): Promise<Record<string, string>> {
  const ajustes: Record<string, string> = {};
  for (const linea of await sinComentarios('.env.produccion.ejemplo')) {
    const [nombre, ...resto] = linea.split('=');
    ajustes[nombre!] = resto.join('=');
  }
  return ajustes;
}

/** Arranca solo la validación de config.ts con ese entorno (sin heredar el de quien ejecuta). */
function validar(entorno: Record<string, string>) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', "import './src/config.ts'"], {
    env: { PATH: process.env.PATH ?? '', ...entorno },
    encoding: 'utf8',
  });
}

test('.env.produccion.ejemplo nombra cada secreto con un valor que el servidor rechaza', async () => {
  const ajustes = await ejemplo();
  // WEBHOOK_SECRET: el servidor lo rechaza por ser el de ejemplo.
  const rechazado = validar(ajustes);
  assert.equal(rechazado.status, 1);
  assert.match(rechazado.stderr, /WEBHOOK_SECRET es el de ejemplo/);
  assert.ok(
    !/ORIGENES_PERMITIDOS|OIDC_|PROXY_CONFIABLE|AVISOS/.test(rechazado.stderr),
    rechazado.stderr,
  );
  // Con un secreto de verdad, lo demás del ejemplo es válido: el único obstáculo es el secreto.
  const aceptado = validar({ ...ajustes, WEBHOOK_SECRET: 'x'.repeat(40) });
  assert.equal(aceptado.status, 0, aceptado.stderr);
  // POSTGRES_PASSWORD: vacía, y compose.produccion.yaml se niega a arrancar sin ella.
  assert.equal(ajustes.POSTGRES_PASSWORD, '');
  assert.match(
    (await servicio('db')).join('\n'),
    /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]+\}/,
  );
});

test('.env.produccion.ejemplo: la web con https, sin avisos de desarrollo y sin proveedor de identidad', async () => {
  const ajustes = await ejemplo();
  assert.match(ajustes.ORIGENES_PERMITIDOS!, /^https:\/\/tienda\.example$/);
  assert.equal(ajustes.AVISOS_HOSTS_DESARROLLO, '');
  // Las cuatro OIDC_* comentadas: una vacía contaría como puesta y el servidor no arrancaría.
  assert.ok(!Object.keys(ajustes).some((nombre) => nombre.startsWith('OIDC_')));
  const texto = await readFile('.env.produccion.ejemplo', 'utf8');
  for (const nombre of ['OIDC_EMISOR', 'OIDC_CLIENTE_ID', 'OIDC_CLIENTE_SECRETO', 'OIDC_VUELTA']) {
    assert.match(texto, new RegExp(`^# ${nombre}=`, 'm'));
  }
  assert.match(texto, /^# IMAGEN=/m);
});

test('la copia de seguridad: .tmp hasta que acaba bien, y solo entonces borra las viejas', async () => {
  const script = await readFile('despliegue/copia-seguridad.sh', 'utf8');
  assert.match(script, /^#!\/usr\/bin\/env bash\n/);
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /pg_dump/);
  // Las copias son la base de datos entera: se crean con permisos 600, antes de escribir nada.
  assert.ok(script.indexOf('umask 077') > script.indexOf('set -euo pipefail'));
  assert.ok(script.indexOf('umask 077') < script.indexOf('exec -T db pg_dump'));
  assert.match(script, /-mtime \+"\$\(\(dias - 1\)\)"/);
  assert.match(script, /-name 'tienda-\*\.sql\.gz\.tmp' -mmin \+60/);
  const volcar = script.indexOf('pg_dump');
  const mover = script.indexOf('mv ');
  const borrar = script.indexOf('-mtime');
  assert.ok(volcar < mover && mover < borrar, 'el orden: volcar, mover y, al final, borrar');
  assert.match(script, /trap .*rm -f/);
  // A folder owned by someone else gets a hint, not a bare chmod error.
  assert.match(script, /if \[ ! -O copias \]; then/);
  assert.match(
    await readFile('despliegue/tienda-copia.service', 'utf8'),
    /^TimeoutStartSec=30min$/m,
  );
  assert.match(
    await readFile('despliegue/tienda-copia.timer', 'utf8'),
    /OnCalendar=\*-\*-\* 03:30:00/,
  );
  assert.match(await readFile('despliegue/tienda-copia.timer', 'utf8'), /Persistent=true/);
  assert.match(await readFile('despliegue/tienda-copia.service', 'utf8'), /Type=oneshot/);
});

test('la imagen trae crear-admin, y .dockerignore deja fuera lo que es del servidor', async () => {
  assert.match(await readFile('Dockerfile', 'utf8'), /scripts\/crear-admin\.ts/);
  const ignorados = await sinComentarios('.dockerignore');
  for (const nombre of ['nginx', 'despliegue', 'copias', 'compose.produccion.yaml']) {
    assert.ok(ignorados.includes(nombre), nombre);
  }
});

test('nginx/tienda.conf es válido tal como está: el certificado de la autoridad propia, activo', async () => {
  const nginx = (await sinComentarios('nginx/tienda.conf')).join('\n');
  assert.match(nginx, /ssl_certificate\s+\/etc\/ssl\/tienda\/tienda\.crt;/);
  assert.match(nginx, /ssl_certificate_key\s+\/etc\/ssl\/tienda\/tienda\.key;/);
  assert.ok(!nginx.includes('letsencrypt'));
  assert.match(nginx, /location = \/eco \{[^}]*proxy_read_timeout 1h;/);
});
