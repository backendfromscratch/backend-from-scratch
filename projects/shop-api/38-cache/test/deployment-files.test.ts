// The deployment files of lesson 6 (the workflow that publishes the image and deploy.sh with its
// timer), checked on their text: no GitHub and no Docker. That they work is shown by the lesson's
// captures, made on a virtual machine with a local registry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
  assert.match(script, /^#!\/usr\/bin\/env bash\n/);
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /^exec 9>\/run\/lock\/shop-deploy\.lock$/m);
  assert.match(script, /^flock -n 9 \|\| exit 0$/m);
  // It never builds: every up carries --no-build.
  const ups = (script.match(/^.*\bup -d\b.*$/gm) ?? []).filter((l) => !l.includes('log '));
  assert.equal(ups.length, 3);
  for (const line of ups) assert.match(line, /--no-build/);
  // The order: keep the running image, ask the registry, backup, migrations and the new API.
  const order = [
    'docker tag "$running" "$previous"',
    'pull --quiet api',
    'deployment/backup.sh',
    'run --rm migrate',
    'up -d --no-build --no-deps api worker',
  ].map((piece) => script.indexOf(piece));
  assert.ok(!order.includes(-1), order.join());
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  // A failing up leads to going back (Compose removes the old container before starting the new).
  assert.match(script, /if "\$\{compose\[@\]\}" up -d --no-build --no-deps api worker; then/);
  // A single copy of the API; the image is kept as :previous only if the container is healthy.
  assert.match(script, /the deployment expects a single copy of the API/);
  // Only the service's containers count, not the ones from a "compose run" (oneoff=False).
  assert.match(script, /label=com\.docker\.compose\.oneoff=False/);
  assert.ok(!/ps --all --quiet api/.test(script.replace(/^\s*#.*$/gm, '')), 'ps includes run ones');
  assert.match(script, /= healthy \]; then\n {2}docker tag "\$running" "\$previous"/);
  // The quotes of IMAGE="…" are removed; a failed image says how to retry it.
  assert.match(script, /image="\$\{image#\[\\"\\'\]\}"/);
  assert.match(script, /to retry it: rm \$PWD\/\.deploy-failed/);
  // Going back uses the image kept on the disk, without migrating again.
  assert.match(
    script,
    /IMAGE="\$previous" "\$\{compose\[@\]\}" up -d --no-build --no-deps api worker/,
  );
  // With nothing new, silence: the running image's ID against the downloaded one's.
  assert.match(script, /if \[ "\$new" = "\$running" \]; then\n {2}exit 0/);
});

test('the deployment also updates the worker', async () => {
  const script = await readFile('deployment/deploy.sh', 'utf8');
  const code = script.replace(/^\s*#.*$/gm, '');
  // Every time the API is started, the worker goes with it: the same image, and the same going
  // back if the new one is no good.
  const withApi = code.match(/^.*\bup -d\b.*--no-deps api\b.*$/gm) ?? [];
  assert.equal(withApi.length, 2);
  for (const line of withApi) assert.match(line, /--no-deps api worker(;| &&|$)/);
  // The other services (db, redis and, since lesson 2, the cache), up to date before: a Redis that
  // has changed (it now keeps the queue on disk) is recreated, and a new one (cache) starts. Without
  // building and without touching the API.
  const others = script.indexOf('up -d --no-build --no-deps db redis cache\n');
  assert.notEqual(others, -1);
  assert.ok(others < script.indexOf('run --rm migrate'));
  assert.ok(others < script.indexOf('up -d --no-build --no-deps api worker'));
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
