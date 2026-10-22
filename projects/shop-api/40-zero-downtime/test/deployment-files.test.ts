// The deployment files of lesson 6 of Phase 8 (the workflow that publishes the image and deploy.sh
// with its timer), checked on their text: no GitHub and no Docker. Since Phase 9 (lesson 4),
// deploy.sh is also run for real, with a fake docker (test/docker-fake.sh) in front on the PATH:
// this shows in what order it changes the copies of the API and how it goes back. That it works
// with a real Docker and nginx is shown by the lessons' captures, made on a virtual machine with a
// local registry.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');

/** The text of one job of the workflow: from "  name:" to the next job. */
function job(name: string): string {
  const from = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(from, -1, `no job ${name}`);
  const rest = workflow.slice(from + 1);
  const to = rest.slice(1).search(/\n {2}\S+:\n/);
  return to === -1 ? rest : rest.slice(0, to + 1);
}

test('the workflow pins every action by the SHA of its commit', () => {
  const uses = [...workflow.matchAll(/^\s+- uses: (\S+)/gm)].map((m) => m[1]!);
  assert.ok(uses.length >= 6, 'actions are missing');
  for (const use of uses) {
    assert.match(use, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, use);
  }
});

test('the workflow asks for the minimum: contents: read, and packages: write only to publish', () => {
  // At the very top, for every job.
  assert.match(workflow, /\npermissions:\n {2}contents: read\n\njobs:/);
  assert.ok(!job('check').includes('permissions:'));
  assert.match(job('publish'), /permissions:\n {6}contents: read\n {6}packages: write/);
  assert.equal(workflow.match(/packages: write/g)?.length, 1);
  // Every checkout keeps the token out of .git/config.
  const checkouts = workflow.match(/actions\/checkout@/g)?.length ?? 0;
  assert.equal(workflow.match(/persist-credentials: false/g)?.length, checkouts);
});

test('the workflow checks on pull requests and only publishes after that, on main', async () => {
  assert.match(workflow, /\non:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/);
  const publish = job('publish');
  assert.match(publish, /needs: check/);
  assert.match(publish, /if: \$\{\{ github\.event_name == 'push' \}\}/);
  const check = job('check');
  assert.match(check, /run: npm ci/);
  assert.match(check, /run: npm run check/);
  assert.match(check, /run: npm test/);
  // PostgreSQL 18 by its digest: the same one compose.production.yaml uses.
  const digest = /postgres:18@sha256:[0-9a-f]{64}/;
  assert.match(check, digest);
  const compose = await readFile('compose.production.yaml', 'utf8');
  assert.equal(check.match(digest)![0], compose.match(digest)![0]);
});

test('the workflow publishes for amd64 and arm64, with the tags sha-<short> and main', () => {
  const publish = job('publish');
  assert.match(publish, /platforms: linux\/amd64,linux\/arm64/);
  assert.match(publish, /type=sha,format=short/);
  assert.match(publish, /type=raw,value=main/);
  // The name comes from the repository's owner, in lowercase and not written inside the script.
  assert.match(publish, /OWNER: \$\{\{ github\.repository_owner \}\}/);
  assert.match(publish, /ghcr\.io\/\$\{OWNER,,\}\/shop-api/);
  assert.ok(!/run:.*\$\{\{/.test(publish), 'an expression inside a run: is an injection');
});

test('deploy.sh: one deployment at a time, no building, and the backup before migrating', async () => {
  const script = await readFile('deployment/deploy.sh', 'utf8');
  const code = script.replace(/^\s*#.*$/gm, '');
  assert.match(script, /^#!\/usr\/bin\/env bash\n/);
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /^exec 9>\/run\/lock\/shop-deploy\.lock$/m);
  assert.match(script, /^flock -n 9 \|\| exit 0$/m);
  // It never builds: every up carries --no-build. Two: the other services, and change (each copy
  // and the worker, one at a time: never two services of the API in the same command).
  const ups = code.match(/^.*\bup -d\b.*$/gm) ?? [];
  assert.equal(ups.length, 2);
  for (const line of ups) assert.match(line, /--no-build --no-deps/);
  assert.match(code, /^ {2}IMAGE="\$2" "\$\{compose\[@\]\}" up -d --no-build --no-deps "\$1"/m);
  // The order: keep the running image, ask the registry, backup, migrations and the copies.
  const order = [
    'docker tag "$running" "$previous"',
    'pull --quiet api-a',
    'deployment/backup.sh',
    'run --rm migrate',
    'change "$first_copy" "$image"',
    'change "$second_copy" "$image"',
    'change worker "$image"',
    'docker image prune --force',
  ].map((piece) => code.indexOf(piece));
  assert.ok(!order.includes(-1), order.join());
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  // Only the service's container counts, not the ones from a "compose run" (oneoff=False).
  assert.match(script, /label=com\.docker\.compose\.oneoff=False/);
  assert.ok(!/ps --all --quiet api/.test(code), 'ps includes run ones');
  // The image is kept as :previous only if the container is healthy.
  assert.match(script, /= healthy \]; then\n {2}docker tag "\$running" "\$previous"/);
  // The quotes of IMAGE="…" are removed; a failed image says how to retry it.
  assert.match(script, /image="\$\{image#\[\\"\\'\]\}"/);
  assert.match(script, /to retry it: rm \$PWD\/\.deploy-failed/);
  // Going back uses the image kept on the disk (change, with $previous), without migrating.
  assert.match(code, /if ! change "\$service" "\$previous" "\$enough"; then/);
});

test('the deployment also updates the worker, with the same image and after the API', async () => {
  const script = await readFile('deployment/deploy.sh', 'utf8');
  const code = script.replace(/^\s*#.*$/gm, '');
  // If the worker doesn't start with the new image, everything goes back: it and the two copies.
  assert.match(
    code,
    /change worker "\$image" \|\| roll_back worker "\$second_copy" "\$first_copy"/,
  );
  // The other services (db, redis and, since lesson 2, the cache), up to date before: a Redis that
  // has changed (it now keeps the queue on disk) is recreated, and a new one (cache) starts. Without
  // building and without touching the API.
  const others = script.indexOf('up -d --no-build --no-deps db redis cache\n');
  assert.notEqual(others, -1);
  assert.ok(others < script.indexOf('run --rm migrate'));
  assert.ok(others < script.indexOf('change "$first_copy" "$image"'));
  // The worker, with the API's image and its own command; the image carries it inside.
  const compose = await readFile('compose.production.yaml', 'utf8');
  const worker = compose.slice(compose.indexOf('\n  worker:\n'));
  assert.match(worker, /^ {4}image: \$\{IMAGE:-shop-api\}$/m);
  assert.match(worker, /^ {4}command: \['node', 'scripts\/worker\.ts'\]$/m);
  assert.match(await readFile('Dockerfile', 'utf8'), /scripts\/worker\.ts/);
});

test('the timer looks every two minutes and the service is a single task', async () => {
  const timer = await readFile('deployment/shop-deploy.timer', 'utf8');
  assert.match(timer, /^OnBootSec=1min$/m);
  assert.match(timer, /^OnUnitActiveSec=2min$/m);
  const service = await readFile('deployment/shop-deploy.service', 'utf8');
  assert.match(service, /^Type=oneshot$/m);
  assert.match(service, /^ExecStart=\/opt\/shop\/deployment\/deploy\.sh$/m);
});

test("the image carries neither the workflow nor the deployment's note", async () => {
  const ignored = (await readFile('.dockerignore', 'utf8')).split('\n');
  for (const name of ['.github', '.deploy-failed']) {
    assert.ok(ignored.includes(name), name);
  }
  assert.ok((await readFile('.gitignore', 'utf8')).split('\n').includes('/.deploy-failed'));
});

// deploy.sh, for real, in a temporary folder: the script, an .env with IMAGE and a fake backup.
// docker and sleep are the ones in test/: sleep doesn't wait, it is only written down. The server
// starts with both copies of the API and the worker healthy, with the old image, and the registry
// has a new one.
const OLD = 'sha256:old';
const NEW = 'sha256:new';
const IMAGE = 'registry.example:5000/shop-api:main';

interface Scenario {
  /** The image the registry brings (by default, a new one). */
  new?: string;
  /** The services running at the start (by default, api-a, api-b and worker). */
  services?: string[];
  /** The image each service runs at the start (by default, the old one). */
  images?: Record<string, string>;
  /** The tags already on the server, besides main on the old image. */
  tags?: Record<string, string>;
  /** How many containers the api service has (by default, one) and its port (127.0.0.1:3000). */
  oldApi?: { copies?: number; port?: string };
  /** The health of the new containers with the new image (by default, healthy). */
  newHealth?: string;
  /** The health of a service's new containers with the new image (if not, newHealth). */
  healthOf?: Record<string, string>;
  /** The health of a service's containers started again with the old image (if not, healthy). */
  oldHealthOf?: Record<string, string>;
  /** Whether Docker passes the published ports through docker-proxy (its userland proxy, on). */
  dockerProxy?: boolean;
}

async function deploy(scenario: Scenario = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'deploy-'));
  try {
    return await deployIn(folder, scenario);
  } finally {
    // Always, even if the test fails: it leaves no folders in the temporary directory.
    await rm(folder, { recursive: true, force: true });
  }
}

async function deployIn(folder: string, scenario: Scenario) {
  const state = join(folder, 'state');
  const bin = join(folder, 'bin');
  for (const sub of [
    'deployment',
    'bin',
    'state/tags',
    'state/containers',
    'state/c',
    'state/health',
  ]) {
    await mkdir(join(folder, sub), { recursive: true });
  }
  // The script, as it is, except for the lock file: /run/lock doesn't exist on macOS, and this way
  // two runs of the tests at once (two folders) don't lock each other.
  const script = await readFile('deployment/deploy.sh', 'utf8');
  const lock = '/run/lock/shop-deploy.lock';
  assert.ok(script.includes(`exec 9>${lock}\n`));
  await writeFile(
    join(folder, 'deployment/deploy.sh'),
    script.replace(`exec 9>${lock}\n`, `exec 9>${join(folder, 'lock')}\n`),
  );
  await writeFile(join(folder, '.env'), `POSTGRES_PASSWORD=x\nIMAGE=${IMAGE}\n`);
  const executables: Record<string, string> = {
    'deployment/backup.sh': '#!/bin/sh\necho "backup" >> "$FAKE/orders"\n',
    'bin/sleep': '#!/bin/sh\necho "sleep $*" >> "$FAKE/orders"\n',
    // flock doesn't come with macOS; here it always gets the lock (the real one, on the server).
    'bin/flock': '#!/bin/sh\nexit 0\n',
    // pgrep, to see whether there is a docker-proxy on the API's ports: the scenario's.
    'bin/pgrep': '#!/bin/sh\necho "pgrep $*" >> "$FAKE/orders"\n[ -f "$FAKE/docker-proxy" ]\n',
    'bin/docker': await readFile('test/docker-fake.sh', 'utf8'),
  };
  for (const [file, text] of Object.entries(executables)) {
    await writeFile(join(folder, file), text);
    await chmod(join(folder, file), 0o755);
  }
  // The server's state: the main tag on the old image, which runs in each service, healthy.
  const tagsBefore = { [IMAGE]: OLD, ...scenario.tags };
  for (const [name, id] of Object.entries(tagsBefore)) {
    await writeFile(join(state, 'tags', name.replace(/[/:]/g, '_')), `${id}\n`);
  }
  await writeFile(join(state, 'new'), `${scenario.new ?? NEW}\n`);
  for (const service of scenario.services ?? ['api-a', 'api-b', 'worker']) {
    const image = scenario.images?.[service] ?? OLD;
    const copies = service === 'api' ? (scenario.oldApi?.copies ?? 1) : 1;
    const ids = Array.from({ length: copies }, (_, n) => `old-${service}${n ? `-${n + 1}` : ''}`);
    for (const id of ids) {
      const port = service === 'api' ? (scenario.oldApi?.port ?? '127.0.0.1:3000') : '';
      await writeFile(
        join(state, 'c', id),
        `image=${image}\nstatus=running\nhealth=healthy\nport=${port}\n`,
      );
    }
    await writeFile(join(state, 'containers', service), `${ids.join('\n')}\n`);
  }
  if (scenario.dockerProxy) await writeFile(join(state, 'docker-proxy'), '');
  if (scenario.newHealth) {
    await writeFile(join(state, 'health', 'new'), `${scenario.newHealth}\n`);
  }
  for (const [service, health] of Object.entries(scenario.healthOf ?? {})) {
    await writeFile(join(state, 'health', `new-${service}`), `${health}\n`);
  }
  for (const [service, health] of Object.entries(scenario.oldHealthOf ?? {})) {
    await writeFile(join(state, 'health', `old-${service}`), `${health}\n`);
  }

  const result = spawnSync('bash', [join(folder, 'deployment/deploy.sh')], {
    env: { PATH: `${bin}:${process.env.PATH}`, FAKE: state },
    encoding: 'utf8',
  });
  const orders = (await readFile(join(state, 'orders'), 'utf8').catch(() => ''))
    .trim()
    .split('\n')
    .filter(Boolean);
  // How the server ends up: each service's container, with its image, and each tag.
  const containers = new Map<string, { id: string; image: string }>();
  for (const service of await readdir(join(state, 'containers'))) {
    const id = (await readFile(join(state, 'containers', service), 'utf8')).trim();
    const data = await readFile(join(state, 'c', id.split('\n')[0]!), 'utf8');
    containers.set(service, { id, image: data.match(/^image=(.*)$/m)![1]! });
  }
  const tags = new Map<string, string>();
  for (const name of await readdir(join(state, 'tags'))) {
    tags.set(name, (await readFile(join(state, 'tags', name), 'utf8')).trim());
  }
  const failed = await readFile(join(folder, '.deploy-failed'), 'utf8').catch(() => '');
  return {
    ...result,
    orders,
    container: (service: string) => containers.get(service),
    tag: (name: string) => tags.get(name.replace(/[/:]/g, '_')),
    failed: failed.trim(),
  };
}

/** The orders that start the API or the worker (not db, redis or cache), in order. */
const starts = (orders: string[]) =>
  orders
    .filter((o) => / up -d /.test(o) && !/ db redis cache$/.test(o))
    .map((o) =>
      o.replace(`docker compose -f compose.production.yaml up -d --no-build --no-deps `, ''),
    );

test('it deploys api-a and api-b one at a time', async () => {
  const d = await deploy();
  assert.equal(d.status, 0, d.stderr);
  // First api-b, then api-a, and at the end the worker: each one, one command, with the new image.
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-b`,
    `IMAGE=${IMAGE} api-a`,
    `IMAGE=${IMAGE} worker`,
  ]);
  const i = (piece: string) => d.orders.findIndex((o) => o.includes(piece));
  // The backup and the migrations, before touching any copy.
  assert.ok(i('backup') < i('run --rm migrate'));
  assert.ok(i('run --rm migrate') < i('up -d --no-build --no-deps api-b'));
  // Between one copy and the other: Docker says api-b is healthy, and a 10 s pause for nginx.
  const b = i('up -d --no-build --no-deps api-b');
  const a = i('up -d --no-build --no-deps api-a');
  const healthy = d.orders.findIndex(
    (o, n) => n > b && o.startsWith('docker inspect') && o.endsWith('api-b'),
  );
  assert.ok(b < healthy && healthy < a, d.orders.join('\n'));
  assert.ok(d.orders.slice(healthy, a).includes('sleep 10'), d.orders.join('\n'));
  for (const service of ['api-a', 'api-b', 'worker']) {
    assert.equal(d.container(service)?.image, NEW, service);
  }
  assert.equal(d.failed, '');
  assert.match(d.stdout, /done/);
});

test("if the first new copy isn't healthy, it goes back without touching the second", async () => {
  const d = await deploy({ newHealth: 'unhealthy' });
  assert.equal(d.status, 1);
  // api-b, with the new one; it isn't healthy: api-b again, with the one that was running (kept as :previous).
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-b`,
    'IMAGE=registry.example:5000/shop-api:previous api-b',
  ]);
  assert.equal(d.container('api-b')?.image, OLD);
  // api-a and the worker, the same containers as before: nobody touched them.
  assert.deepEqual(d.container('api-a'), { id: 'old-api-a', image: OLD });
  assert.deepEqual(d.container('worker'), { id: 'old-worker', image: OLD });
  // The failed image is written down, so it isn't tried again every two minutes.
  assert.equal(d.failed, NEW);
  assert.match(d.stderr, /going back to/);
});

test("if the second new copy isn't healthy, both go back, one at a time", async () => {
  const d = await deploy({ healthOf: { 'api-a': 'unhealthy' } });
  assert.equal(d.status, 1);
  // The first and the second with the new one; then, both with the previous one: first the one that
  // didn't start (api-a), while api-b answers, and then api-b. The worker, untouched.
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-b`,
    `IMAGE=${IMAGE} api-a`,
    'IMAGE=registry.example:5000/shop-api:previous api-a',
    'IMAGE=registry.example:5000/shop-api:previous api-b',
  ]);
  assert.equal(d.container('api-b')?.image, OLD);
  assert.deepEqual(d.container('worker'), { id: 'old-worker', image: OLD });
  assert.equal(d.failed, NEW);
});

test('if the new worker never gets healthy (no heartbeat), everything goes back', async () => {
  // A worker that hangs or restarts in a loop never writes its heartbeat: after 60 seconds, the
  // worker and both copies go back to the previous image, the worker first.
  const d = await deploy({ healthOf: { worker: 'starting' } });
  assert.equal(d.status, 1);
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-b`,
    `IMAGE=${IMAGE} api-a`,
    `IMAGE=${IMAGE} worker`,
    'IMAGE=registry.example:5000/shop-api:previous worker',
    'IMAGE=registry.example:5000/shop-api:previous api-a',
    'IMAGE=registry.example:5000/shop-api:previous api-b',
  ]);
  for (const service of ['api-a', 'api-b', 'worker']) {
    assert.equal(d.container(service)?.image, OLD, service);
  }
  assert.equal(d.failed, NEW);
  assert.match(d.stderr, /never got healthy on worker/);
});

test('going back, the worker only has to run: an old image without a heartbeat still goes back', async () => {
  // The previous image may come from before the heartbeat (step 39 or earlier): its worker never
  // gets healthy, it stays starting. Going back doesn't wait for that: it is enough that it runs.
  const d = await deploy({ healthOf: { worker: 'starting' }, oldHealthOf: { worker: 'starting' } });
  assert.equal(d.status, 1);
  assert.equal(starts(d.orders).at(-3), 'IMAGE=registry.example:5000/shop-api:previous worker');
  for (const service of ['api-a', 'api-b', 'worker']) {
    assert.equal(d.container(service)?.image, OLD, service);
  }
  assert.match(d.stderr, /back done/);
  assert.doesNotMatch(d.stderr, /not healthy either/);
  // Going forward, it did wait for the new worker: 30 times 2 s; going back, not once.
  const back = d.orders.findIndex((o) => o.endsWith(':previous worker'));
  assert.equal(d.orders.slice(0, back).filter((o) => o === 'sleep 2').length, 30);
  assert.equal(d.orders.slice(back).filter((o) => o === 'sleep 2').length, 0);
});

test('it stops waiting as soon as the container is unhealthy', async () => {
  // Unhealthy: Docker has already considered the copy bad; there is nothing to wait for.
  const bad = await deploy({ newHealth: 'unhealthy' });
  const backB = (o: string) =>
    o.startsWith('IMAGE=registry.example:5000/shop-api:previous ') && o.endsWith(' api-b');
  const goingBack = bad.orders.findIndex(backB);
  assert.notEqual(goingBack, -1);
  assert.equal(bad.orders.slice(0, goingBack).filter((o) => o === 'sleep 2').length, 0);
  // While it is starting, it does wait: up to 60 seconds, 30 times 2 s.
  const slow = await deploy({ newHealth: 'starting' });
  assert.equal(slow.status, 1);
  const goingBackSlow = slow.orders.findIndex(backB);
  assert.equal(slow.orders.slice(0, goingBackSlow).filter((o) => o === 'sleep 2').length, 30);
});

test('it deletes the images older than the previous one', async () => {
  const d = await deploy();
  assert.equal(d.status, 0, d.stderr);
  // At the end, with everything healthy: docker image prune deletes the images with no tag. The new
  // one stays (main, and the containers use it) and the previous one (:previous, in case it's
  // needed to go back); the older ones lost their last tag when :previous moved to another one.
  const prune = d.orders.findIndex((o) => o.startsWith('docker image prune'));
  assert.equal(d.orders[prune], 'docker image prune --force');
  assert.ok(prune > d.orders.findIndex((o) => o.includes('--no-deps worker')));
  assert.equal(d.tag('registry.example:5000/shop-api:previous'), OLD);
  assert.equal(d.tag(IMAGE), NEW);
  // If something fails, it deletes nothing: the images help to see what happened.
  const bad = await deploy({ newHealth: 'unhealthy' });
  assert.ok(!bad.orders.some((o) => o.includes('image prune')));
});

test('the first time, the single-copy API (api service) keeps going until api-b is healthy', async () => {
  // A server coming from step 39: a single copy, the api service, on port 3000.
  const d = await deploy({ services: ['api', 'worker'] });
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-b`,
    `IMAGE=${IMAGE} api-a`,
    `IMAGE=${IMAGE} worker`,
  ]);
  // api-b (port 3001, free) starts while the old one answers; the old one is stopped (SIGTERM) and
  // removed right before api-a, which needs its port.
  const i = (order: string) => d.orders.indexOf(order);
  assert.ok(
    i(`IMAGE=${IMAGE} docker compose -f compose.production.yaml up -d --no-build --no-deps api-b`) <
      i('docker stop old-api'),
  );
  assert.ok(i('docker stop old-api') < i('docker rm old-api'));
  assert.ok(
    i('docker rm old-api') <
      i(
        `IMAGE=${IMAGE} docker compose -f compose.production.yaml up -d --no-build --no-deps api-a`,
      ),
  );
  assert.equal(d.container('api'), undefined);
  // The image that was running in the old one is the previous one.
  assert.equal(d.tag('registry.example:5000/shop-api:previous'), OLD);
});

test('with no new image, it does nothing and writes nothing', async () => {
  const d = await deploy({ new: OLD });
  assert.equal(d.status, 0, d.stderr);
  assert.equal(d.stdout, '');
  assert.deepEqual(starts(d.orders), []);
});

test('a deployment cut halfway (the worker with the old one): it finishes it and leaves :previous alone', async () => {
  // A restart or a systemctl stop between api-a and the worker: the copies run the new one, the
  // worker the old one, and :previous is still on the old one, the really previous one.
  const previous = 'registry.example:5000/shop-api:previous';
  const d = await deploy({
    images: { 'api-a': NEW, 'api-b': NEW },
    tags: { [IMAGE]: NEW, [previous]: OLD },
  });
  assert.equal(d.status, 0, d.stderr);
  // It isn't "nothing new": the worker runs another image. The deployment goes on to the end.
  assert.deepEqual(starts(d.orders).at(-1), `IMAGE=${IMAGE} worker`);
  assert.equal(d.container('worker')?.image, NEW);
  // :previous doesn't move to the new one: if it did, the old one would be left without a tag and prune would delete it.
  assert.equal(d.tag(previous), OLD);
  assert.ok(!d.orders.some((o) => o.startsWith('docker tag')), d.orders.join('\n'));
});

test('the single-copy API in several copies (--scale): it touches nothing and says so', async () => {
  const d = await deploy({ services: ['api', 'worker'], oldApi: { copies: 2 } });
  assert.equal(d.status, 1);
  assert.match(d.stderr, /2 containers of the api service/);
  assert.deepEqual(starts(d.orders), []);
  assert.ok(!d.orders.some((o) => o.includes('pull')));
});

test('the first time, with the single-copy API on 3001: first api-a, then api-b', async () => {
  // Step 39's 3000-3001 range moved the single copy from one port to the other on every deployment.
  // On 3001, the free port is api-a's: it starts first, and the old one leaves its own to api-b.
  const d = await deploy({
    services: ['api', 'worker'],
    oldApi: { port: '127.0.0.1:3001' },
  });
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-a`,
    `IMAGE=${IMAGE} api-b`,
    `IMAGE=${IMAGE} worker`,
  ]);
  const i = (order: string) => d.orders.indexOf(order);
  const up = (service: string) =>
    i(
      `IMAGE=${IMAGE} docker compose -f compose.production.yaml up -d --no-build --no-deps ${service}`,
    );
  assert.ok(up('api-a') < i('sleep 10'));
  assert.ok(i('sleep 10') < i('docker stop old-api'));
  assert.ok(i('docker stop old-api') < i('docker rm old-api'));
  assert.ok(i('docker rm old-api') < up('api-b'));
  assert.equal(d.container('api'), undefined);
  assert.equal(d.container('api-a')?.image, NEW);
  assert.equal(d.container('api-b')?.image, NEW);
});

test("if api-a isn't healthy that first time (old one on 3001), it goes back without touching the old one", async () => {
  const d = await deploy({
    services: ['api', 'worker'],
    oldApi: { port: '127.0.0.1:3001' },
    newHealth: 'unhealthy',
  });
  assert.equal(d.status, 1);
  assert.deepEqual(starts(d.orders), [
    `IMAGE=${IMAGE} api-a`,
    'IMAGE=registry.example:5000/shop-api:previous api-a',
  ]);
  assert.ok(!d.orders.some((o) => o.startsWith('docker stop')));
  assert.equal(d.container('api')?.id, 'old-api');
});

test('the single-copy API on another port: it touches nothing and says so', async () => {
  const d = await deploy({
    services: ['api', 'worker'],
    oldApi: { port: '0.0.0.0:3000' },
  });
  assert.equal(d.status, 1);
  assert.match(d.stderr, /neither port 3000 nor 3001/);
  assert.deepEqual(starts(d.orders), []);
});

test("it warns if Docker passes the API's ports through docker-proxy, and deploys anyway", async () => {
  // With docker-proxy, the port of a copy that is shutting down accepts the connection and cuts it:
  // nginx doesn't repeat a POST it already sent. Without it (the lesson turns it off), the
  // connection is refused.
  const withProxy = await deploy({ dockerProxy: true });
  assert.equal(withProxy.status, 0, withProxy.stderr);
  assert.match(withProxy.stderr, /userland-proxy/);
  assert.equal(withProxy.container('api-a')?.image, NEW);
  const without = await deploy();
  assert.doesNotMatch(without.stderr, /userland-proxy/);
  // With nothing new, not even that: silence.
  const nothing = await deploy({ new: OLD, dockerProxy: true });
  assert.equal(nothing.stderr, '');
  assert.equal(nothing.stdout, '');
});
