import assert from 'node:assert/strict';
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';
import { recordEvent } from '../src/data.ts';
import { pool } from '../src/db.ts';
import { useDb } from './db.ts';
import { ANA, CARMEN, asUser } from './identities.ts';

// Ana, admin; Carmen, a customer.
let ana: Record<string, string>;
let carmen: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
  carmen = await asUser(CARMEN);
});

const run = promisify(execFile);

// No API route creates categories: the test adds its own, with a name that already exists.
app.get('/repeated-test', async (c) => {
  await pool.query(`INSERT INTO categories (name) VALUES ('Clothing')`);
  return c.text('it should not get here');
});

/** Starts src/server.ts on a free port and returns the process and its address. */
async function start(): Promise<{ server: ChildProcess; url: string }> {
  const free = createServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as { port: number }).port;
  free.close();
  const server = spawn('node', ['src/server.ts'], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'info' },
  });
  await once(server.stdout!, 'data'); // the line "The shop is listening on…"
  return { server, url: `http://127.0.0.1:${port}` };
}

/** Stops the server and waits for it to finish. */
async function stop(server: ChildProcess) {
  server.kill();
  await once(server, 'exit');
}

test('the data survives a server restart, the idempotency keys too', async () => {
  const send = (url: string) =>
    fetch(`${url}/v2/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'before-the-restart',
        ...carmen,
      },
      body: '{"productId":3,"quantity":2}',
    });

  const first = await start();
  const created = await (await send(first.url)).json();
  await stop(first.server);

  // Another process, with its own pool: the only thing it shares with the previous one is the
  // database.
  const second = await start();
  try {
    const read = await fetch(`${second.url}/v2/orders/${created.id}`, { headers: carmen });
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), created);
    const repeated = await send(second.url);
    assert.equal(repeated.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await repeated.json(), created);
  } finally {
    await stop(second.server);
  }
});

test('each row comes out with the API names: priceCents, productId and createdAt in ISO 8601', async () => {
  assert.deepEqual(await (await app.request('/v2/products/4')).json(), {
    id: 4,
    name: 'Cap',
    priceCents: 1500,
    stock: 15,
    categories: ['Clothing', 'Gifts'],
  });
  assert.deepEqual(await (await app.request('/v2/orders/1', { headers: ana })).json(), {
    id: 1,
    productId: 2,
    quantity: 2,
    status: 'shipped',
    createdAt: '2026-10-01T09:00:00.000Z',
    customerId: 3,
  });
});

test('deleting a product with orders: 409 as Problem Details, and the product is still there', async () => {
  const res = await app.request('/v2/products/1', { method: 'DELETE', headers: ana });
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(await res.json(), {
    type: 'about:blank',
    title: 'Conflict',
    status: 409,
    detail: 'Other data depends on this: a product with orders, for example, cannot be deleted',
  });
  assert.equal((await app.request('/v2/products/1')).status, 200);
  const doc = await (await app.request('/v2/openapi.json')).json();
  assert.ok(doc.paths['/products/{id}'].delete.responses['409']);
});

test('a repeated value where it has to be unique (23505): 409, not 500', async () => {
  const res = await app.request('/repeated-test');
  assert.equal(res.status, 409);
  assert.equal(
    (await res.json()).detail,
    'The same data already exists, and it cannot be repeated',
  );
});

test('a payment notification is written down in processed_events', async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM processed_events');
  assert.equal(rows[0].n, 0);
  assert.equal(await recordEvent('evt_test'), true);
  assert.equal(await recordEvent('evt_test'), false, 'the second time it was already there');
});

test('examples/injection.ts: pasting the text, the malicious value brings everything; with a parameter, nothing', async () => {
  const { stdout } = await run('node', ['examples/injection.ts']);
  const [normal, malicious] = stdout.split('\nSearching for: ').slice(1);
  assert.match(normal!, /Pasting the text, it finds: \[ 'Mug' \]/);
  assert.match(normal!, /With a parameter, it finds: \[ 'Mug' \]/);
  assert.match(
    malicious!,
    /The query: SELECT name FROM products WHERE name = 'x' OR '1'='1' ORDER BY id$/m,
  );
  assert.match(malicious!, /Pasting the text, it finds: \[ 'T-shirt', 'Mug', 'Hoodie', 'Cap' \]/);
  assert.match(malicious!, /With a parameter, it finds: \[\]/);
});

test('without DATABASE_URL, the server does not start and says why', async () => {
  const { DATABASE_URL, ...withoutDatabase } = process.env;
  const result = await run('node', ['src/server.ts'], { env: withoutDatabase }).catch(
    (error) => error,
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Configuration: DATABASE_URL: DATABASE_URL is missing/);
});
