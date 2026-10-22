// The production files of lesson 4 (compose.production.yaml, nginx/shop.conf,
// .env.production.example and the backup), checked on their text: without Docker or nginx. That
// they start and work together is shown by the lessons' captures, made in a virtual machine with
// Ubuntu.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** A file, without comments (# …) or blank lines. */
async function withoutComments(file: string): Promise<string[]> {
  const text = await readFile(file, 'utf8');
  return text
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, '').trimEnd())
    .filter((line) => line.trim() !== '');
}

/** The lines of a service in compose.production.yaml: from "  name:" to the next one. */
async function service(name: string): Promise<string[]> {
  const all = await withoutComments('compose.production.yaml');
  const from = all.indexOf(`  ${name}:`);
  assert.notEqual(from, -1, `there is no service ${name}`);
  const to = all.findIndex((line, i) => i > from && /^ {0,2}\S/.test(line));
  return all.slice(from + 1, to === -1 ? undefined : to);
}

/**
 * What the two copies of the API share: the x-api: &api block in compose.production.yaml, with two
 * spaces less, so it reads like the lines of a service.
 */
async function anchor(): Promise<string[]> {
  const all = await withoutComments('compose.production.yaml');
  const from = all.indexOf('x-api: &api');
  assert.notEqual(from, -1, 'there is no x-api: &api');
  const to = all.findIndex((line, i) => i > from && /^\S/.test(line));
  return all.slice(from + 1, to).map((line) => `  ${line}`);
}

test('compose.production.yaml publishes neither db nor redis, and the API only on 127.0.0.1', async () => {
  const published = (await withoutComments('compose.production.yaml')).filter((l) =>
    /^\s+- '?[\d.:-]+:\d+'?$/.test(l),
  );
  assert.deepEqual(published, ["      - '127.0.0.1:3000:3000'", "      - '127.0.0.1:3001:3000'"]);
  for (const name of ['db', 'redis', 'cache', 'migrate', 'worker']) {
    assert.ok(!(await service(name)).some((l) => l.trim() === 'ports:'), name);
  }
  // The ones that have to come back on their own after a server restart (the API, the two copies).
  for (const name of ['db', 'redis', 'cache', 'worker']) {
    assert.ok((await service(name)).includes('    restart: unless-stopped'), name);
  }
  assert.ok((await anchor()).includes('    restart: unless-stopped'));
});

test('production: two copies of the API, api-a on 3000 and api-b on 3001, with everything else the same', async () => {
  // Each copy: the anchor and its port, nothing else. They are the two ports of nginx's upstream.
  assert.deepEqual(await service('api-a'), [
    '    <<: *api',
    '    ports:',
    "      - '127.0.0.1:3000:3000'",
  ]);
  assert.deepEqual(await service('api-b'), [
    '    <<: *api',
    '    ports:',
    "      - '127.0.0.1:3001:3000'",
  ]);
  const nginx = (await withoutComments('nginx/shop.conf')).join('\n');
  assert.match(nginx, /server 127\.0\.0\.1:3000 /);
  assert.match(nginx, /server 127\.0\.0\.1:3001 /);
  // There is no api service any more (the single-copy one, up to step 39).
  assert.ok(!(await withoutComments('compose.production.yaml')).includes('  api:'));
  // docker stop waits 10 s before killing it, and the API shuts down in 8 at most.
  assert.ok((await anchor()).includes('    stop_grace_period: 10s'));
  const server = await readFile('src/server.ts', 'utf8');
  assert.match(server, /await shutDown\(server, resources, 8000\);/);
});

test('on shutdown, the API closes PostgreSQL and then the connections to Redis, in order', async () => {
  // PostgreSQL, and then Redis: the queue, the order notices, the cache and the limits.
  const server = await readFile('src/server.ts', 'utf8');
  const resources = server.match(/^const resources = \[\n([^\]]*)\];$/m);
  assert.ok(resources, 'const resources = [ … ] is missing');
  assert.deepEqual(
    resources[1]!
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    [
      '{ close: () => pool.end() },',
      '{ close: closeQueue },',
      'orderChanges,',
      'cache,',
      '{ close: closeLimits },',
    ],
  );
});

test("the API's, migrate's and the worker's image is the same: build and ${IMAGE:-shop-api}", async () => {
  for (const [name, lines] of [
    ['api', await anchor()],
    ['migrate', await service('migrate')],
    ['worker', await service('worker')],
  ] as const) {
    assert.ok(lines.includes('    build: .'), name);
    assert.ok(lines.includes('    image: ${IMAGE:-shop-api}'), name);
  }
});

test('production: Redis keeps the queue on disk, no Mailpit, and SMTP_URL only from .env', async () => {
  const redis = (await service('redis')).join('\n');
  assert.match(
    redis,
    /command: \['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'\]/,
  );
  assert.match(redis, /volumes:\n\s+- redis:\/data/);
  const compose = (await withoutComments('compose.production.yaml')).join('\n');
  assert.ok(!compose.includes('mailpit'), 'Mailpit is only for your computer');
  // SMTP_URL isn't written in the Compose file: it comes from .env, and without it no email is sent.
  assert.ok(!compose.includes('SMTP_URL'));
  assert.ok((await service('worker')).includes('    env_file: .env'));
  // The worker, with the healthcheck of its heartbeat, as in compose.yaml.
  const worker = await service('worker');
  assert.ok(worker.some((l) => l.includes("statSync('/tmp/heartbeat').mtimeMs < 30000")));
  assert.ok(!worker.some((l) => l.includes('disable: true')));
  assert.ok(worker.includes('      start_interval: 1s'));
  assert.match(await readFile('.env.production.example', 'utf8'), /^# SMTP_URL=smtps:\/\//m);
});

test('production: the cache, another Redis with no disk, and CACHE_URL for the API and the worker', async () => {
  const cache = (await service('cache')).join('\n');
  // The command, word by word (prettier writes it on several lines: it is long).
  const command = cache.slice(cache.indexOf('command:')).split(']')[0]!;
  assert.deepEqual(
    [...command.matchAll(/'([^']*)'/g)].map((word) => word[1]),
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
  assert.ok((await anchor()).includes('      CACHE_URL: redis://cache:6379'));
  assert.ok((await service('worker')).includes('      CACHE_URL: redis://cache:6379'));
  assert.match(await readFile('.env.production.example', 'utf8'), /CACHE_URL/);
});

test("Compose's network has the pinned subnet TRUSTED_PROXY relies on", async () => {
  const compose = (await withoutComments('compose.production.yaml')).join('\n');
  assert.match(
    compose,
    /networks:\n {2}default:\n {4}ipam:\n {6}config:\n {8}- subnet: 172\.18\.0\.0\/16/,
  );
  const proxy = (await withoutComments('.env.production.example')).find((l) =>
    l.startsWith('TRUSTED_PROXY='),
  );
  assert.equal(proxy, 'TRUSTED_PROXY=172.18.0.1');
});

test('migrate does not load the practice accounts', async () => {
  const migrate = (await service('migrate')).join('\n');
  assert.match(migrate, /node scripts\/seed\.ts --no-accounts/);
  assert.ok(!/seed\.ts(?! --no-accounts)/.test(migrate));
});

test('nginx passes X-Forwarded-For and X-Forwarded-Proto and turns off buffering on the events route', async () => {
  const nginx = (await withoutComments('nginx/shop.conf')).join('\n');
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  // The events route has its own location, with buffering off and a long wait.
  const events = nginx.match(/location ~ \^\/v2\/orders\/\[\^\/\]\+\/events\$ \{([^}]*)\}/);
  assert.ok(events, 'the location for /v2/orders/:id/events is missing');
  assert.match(events[1]!, /proxy_buffering off;/);
  assert.match(events[1]!, /proxy_read_timeout 1h;/);
  // The two copies of the API, with a passive check (max_fails and fail_timeout).
  assert.match(nginx, /server 127\.0\.0\.1:3000 max_fails=1 fail_timeout=\d+s;/);
  assert.match(nginx, /server 127\.0\.0\.1:3001 max_fails=1 fail_timeout=\d+s;/);
  // Port 80 only redirects, except for Let's Encrypt's challenge.
  assert.match(nginx, /location \/\.well-known\/acme-challenge\/ \{/);
  assert.match(nginx, /return 301 https:\/\/\$host\$request_uri;/);
});

/** The uncommented settings of .env.production.example, as an object. */
async function example(): Promise<Record<string, string>> {
  const settings: Record<string, string> = {};
  for (const line of await withoutComments('.env.production.example')) {
    const [name, ...rest] = line.split('=');
    settings[name!] = rest.join('=');
  }
  return settings;
}

/** Runs only config.ts's validation with that environment (without inheriting the caller's). */
function validate(environment: Record<string, string>) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', "import './src/config.ts'"], {
    env: { PATH: process.env.PATH ?? '', ...environment },
    encoding: 'utf8',
  });
}

test('.env.production.example names every secret with a value the server rejects', async () => {
  const settings = await example();
  // WEBHOOK_SECRET: the server rejects it for being the example one.
  const rejected = validate(settings);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /WEBHOOK_SECRET is the example one/);
  assert.ok(
    !/ALLOWED_ORIGINS|OIDC_|TRUSTED_PROXY|NOTIFICATION/.test(rejected.stderr),
    rejected.stderr,
  );
  // With a real secret, the rest of the example is valid: the only obstacle is the secret.
  const accepted = validate({ ...settings, WEBHOOK_SECRET: 'x'.repeat(40) });
  assert.equal(accepted.status, 0, accepted.stderr);
  // POSTGRES_PASSWORD: empty, and compose.production.yaml refuses to start without it.
  assert.equal(settings.POSTGRES_PASSWORD, '');
  assert.match(
    (await service('db')).join('\n'),
    /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]+\}/,
  );
});

test('.env.production.example: the site with https, no development notifications and no identity provider', async () => {
  const settings = await example();
  assert.match(settings.ALLOWED_ORIGINS!, /^https:\/\/shop\.example$/);
  assert.equal(settings.NOTIFICATION_DEV_HOSTS, '');
  // The four OIDC_* commented out: an empty one would count as set and the server wouldn't start.
  assert.ok(!Object.keys(settings).some((name) => name.startsWith('OIDC_')));
  const text = await readFile('.env.production.example', 'utf8');
  for (const name of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']) {
    assert.match(text, new RegExp(`^# ${name}=`, 'm'));
  }
  assert.match(text, /^# IMAGE=/m);
});

test('the backup: .tmp until it ends well, and only then deletes the old ones', async () => {
  const script = await readFile('deployment/backup.sh', 'utf8');
  assert.match(script, /^#!\/usr\/bin\/env bash\n/);
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /pg_dump/);
  // The backups are the whole database: they're created with permissions 600, before writing anything.
  assert.ok(script.indexOf('umask 077') > script.indexOf('set -euo pipefail'));
  assert.ok(script.indexOf('umask 077') < script.indexOf('exec -T db pg_dump'));
  assert.match(script, /-mtime \+"\$\(\(days - 1\)\)"/);
  assert.match(script, /-name 'shop-\*\.sql\.gz\.tmp' -mmin \+60/);
  const dump = script.indexOf('pg_dump');
  const move = script.indexOf('mv ');
  const remove = script.indexOf('-mtime');
  assert.ok(dump < move && move < remove, 'the order: dump, move and, at the end, delete');
  assert.match(script, /trap .*rm -f/);
  // A folder owned by someone else gets a hint, not a bare chmod error.
  assert.match(script, /if \[ ! -O backups \]; then/);
  assert.match(
    await readFile('deployment/shop-backup.service', 'utf8'),
    /^TimeoutStartSec=30min$/m,
  );
  assert.match(
    await readFile('deployment/shop-backup.timer', 'utf8'),
    /OnCalendar=\*-\*-\* 03:30:00/,
  );
  assert.match(await readFile('deployment/shop-backup.timer', 'utf8'), /Persistent=true/);
  assert.match(await readFile('deployment/shop-backup.service', 'utf8'), /Type=oneshot/);
});

test('the image brings create-admin, and .dockerignore leaves out what belongs to the server', async () => {
  assert.match(await readFile('Dockerfile', 'utf8'), /scripts\/create-admin\.ts/);
  const ignored = await withoutComments('.dockerignore');
  for (const name of ['nginx', 'deployment', 'backups', 'compose.production.yaml']) {
    assert.ok(ignored.includes(name), name);
  }
});

test("nginx/shop.conf is valid as it is: your own authority's certificate, active", async () => {
  const nginx = (await withoutComments('nginx/shop.conf')).join('\n');
  assert.match(nginx, /ssl_certificate\s+\/etc\/ssl\/shop\/shop\.crt;/);
  assert.match(nginx, /ssl_certificate_key\s+\/etc\/ssl\/shop\/shop\.key;/);
  assert.ok(!nginx.includes('letsencrypt'));
  assert.match(nginx, /location = \/echo \{[^}]*proxy_read_timeout 1h;/);
});
