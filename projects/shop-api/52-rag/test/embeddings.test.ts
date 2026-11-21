// Search by meaning (Phase 11, lesson 5): migration 014, the vectors the worker computes from the
// outbox events, npm run embeddings and search_products by meaning, in the assistant and in MCP.
// Always with the fake embedder (fake-embedder.ts): the real model is tried by npm run
// check-embeddings, which isn't part of npm test.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { serve, type ServerType } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  DESCRIPTION_BY_MEANING,
  NEAREST,
  searchCatalogue,
  searchProductsByMeaning,
} from '../src/assistant/tools/search-products.ts';
import { config } from '../src/config.ts';
import { db, pool } from '../src/db.ts';
import {
  BATCH,
  DIMENSIONS,
  type Embedder,
  fillVectors,
  productText,
  saveVectors,
  useEmbedder,
} from '../src/embeddings.ts';
import { relay } from '../src/outbox.ts';
import { createWorker, enqueue, type Job, JOB_OPTIONS, QUEUE_NAME, runJob } from '../src/queue.ts';
import { connectRedis, type RedisClient } from '../src/redis-store.ts';
import { products } from '../src/schema.ts';
import { run, useDb } from './db.ts';
import { createFakeEmbedder, fakeVector } from './fake-embedder.ts';
import { asksForTools, startFakeModel, text, toolUseBlock } from './fake-model.ts';
import { ANA, asKey, asUser, CARMEN } from './identities.ts';

// The Claude API's fake model, before importing the shop (the SDK reads ANTHROPIC_BASE_URL when it
// creates the client), as in assistant-tools.test.ts.
const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => model.reset());
const { app } = await import('../src/app.ts');

// The fake embedder, a new one in each test: so each knows what it was asked for.
let embedder: ReturnType<typeof createFakeEmbedder>;
beforeEach(() => {
  embedder = createFakeEmbedder();
  useEmbedder(embedder);
});

let ana: Record<string, string>;
let carmen: Record<string, string>;
let catalogue: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
  carmen = await asUser(CARMEN);
  catalogue = await asKey('catalogue');
});

// Each test starts with the practice catalogue without vectors and without outbox events, and with
// semantic search on (test/.env), even if the previous one turned it off.
beforeEach(async () => {
  await pool.query('UPDATE products SET embedding = NULL');
  await pool.query('DELETE FROM outbox_events');
  config.SEMANTIC_SEARCH = 'yes';
});

const send = (method: string, path: string, body: unknown) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...ana },
    body: JSON.stringify(body),
  });

/** A product's vector, as it is in PostgreSQL (null if it has none). */
async function vectorOf(id: number): Promise<number[] | null> {
  const [row] = await db
    .select({ embedding: products.embedding })
    .from(products)
    .where(eq(products.id, id));
  return row!.embedding;
}

/** The outbox events, in order. */
const outbox = async () =>
  (
    await pool.query<{ type: string; data: Job }>(
      'SELECT type, data FROM outbox_events ORDER BY id',
    )
  ).rows;

/** Two almost equal vectors: PostgreSQL stores each number with 32 bits (float4), JavaScript with 64. */
function almostEqual(a: number[], b: number[]) {
  assert.equal(a.length, b.length);
  for (const [i, x] of a.entries()) assert.ok(Math.abs(x - b[i]!) < 1e-6, `position ${i}`);
}

/** The cosine distance between two vectors of length 1, computed in JavaScript. */
const distance = (a: number[], b: number[]) => 1 - a.reduce((sum, x, i) => sum + x * b[i]!, 0);

// #region migration
test('migration 014: the vector extension, the description, the 384 vector and the HNSW index', async () => {
  const extension = await pool.query(
    `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
  );
  assert.equal(extension.rowCount, 1);
  const columns = await pool.query(
    `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'products' AND column_name IN ('description', 'embedding') ORDER BY 1`,
  );
  assert.deepEqual(columns.rows, [
    { column_name: 'description', udt_name: 'text', is_nullable: 'YES' },
    { column_name: 'embedding', udt_name: 'vector', is_nullable: 'YES' },
  ]);
  const index = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'products_by_embedding'`,
  );
  assert.match(index.rows[0].indexdef, /USING hnsw \(embedding vector_cosine_ops\)/);
  // A vector with another number of dimensions doesn't fit.
  await assert.rejects(
    pool.query(`UPDATE products SET embedding = $1 WHERE id = 1`, [
      JSON.stringify(new Array(DIMENSIONS - 1).fill(0.1)),
    ]),
    /expected 384 dimensions/,
  );
});

test("the search's query can use the HNSW index (with 20 rows, PostgreSQL prefers reading the table)", async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Without this ban, with so few rows, reading the whole table is cheaper than the index.
    await client.query('SET LOCAL enable_seqscan = off');
    const { rows } = await client.query(
      `EXPLAIN SELECT id FROM products WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1 LIMIT 5`,
      [JSON.stringify(fakeVector('something for the cold'))],
    );
    await client.query('ROLLBACK');
    assert.match(rows.map((row) => row['QUERY PLAN']).join('\n'), /products_by_embedding/);
  } finally {
    client.release();
  }
});

test('the practice catalogue: 20 products with a description and no vector; the usual four, the same', async () => {
  const { rows } = await pool.query(
    'SELECT id, name, price_cents, description, embedding FROM products ORDER BY id',
  );
  assert.equal(rows.length, 20);
  assert.ok(rows.every((row) => row.description && row.embedding === null));
  assert.deepEqual(
    rows.slice(0, 4).map(({ id, name, price_cents }) => [id, name, price_cents]),
    [
      [1, 'T-shirt', 2000],
      [2, 'Mug', 850],
      [3, 'Hoodie', 3500],
      [4, 'Cap', 1500],
    ],
  );
});
// #endregion migration

// #region search
test('searchProductsByMeaning: the nearest ones, sorted by cosine distance, with it', async () => {
  await fillVectors();
  embedder.requests.length = 0;
  const query = 'a thick wool scarf for winter';
  const found = await searchProductsByMeaning(query);
  // The API only computes the query's vector.
  assert.deepEqual(embedder.requests, [[query]]);
  assert.equal(found.length, NEAREST);
  assert.equal(found[0]!.name, 'Scarf');
  // The same distances the sum in JavaScript gives, and in order: the NEAREST smallest ones.
  const { rows } = await pool.query('SELECT name, description FROM products');
  const all = rows
    .map(
      (row) => Math.round(distance(fakeVector(query), fakeVector(productText(row))) * 1000) / 1000,
    )
    .toSorted((a, b) => a - b);
  assert.deepEqual(
    found.map((product) => product.distance),
    all.slice(0, NEAREST),
  );
  assert.deepEqual(Object.keys(found[0]!), [
    'id',
    'name',
    'description',
    'priceCents',
    'stock',
    'distance',
  ]);
});

test('hybrid search: first the ones with the query in their name (also without a vector), then the nearest', async () => {
  await fillVectors();
  // A new product: its vector isn't there yet (the worker would compute it).
  const res = await send('POST', '/v2/products', { name: 'Silk scarf', priceCents: 3000 });
  assert.equal(res.status, 201);
  const added = await res.json();
  const found = await searchProductsByMeaning('scarf');
  assert.equal(found.length, 2 + NEAREST);
  // The two with "scarf" in their name, by id: the Scarf, with its distance, and the new one, which
  // isn't lost even without a vector (distance null).
  assert.equal(found[0]!.name, 'Scarf');
  assert.equal(typeof found[0]!.distance, 'number');
  assert.deepEqual(found[1], {
    id: added.id,
    name: 'Silk scarf',
    description: null,
    priceCents: 3000,
    stock: 0,
    distance: null,
  });
  // Then, the nearest ones, repeating none, from most to least alike.
  const nearest = found.slice(2);
  assert.ok(nearest.every((product) => !/scarf/i.test(product.name)));
  const distances = nearest.map((product) => product.distance!);
  assert.deepEqual(
    distances,
    distances.toSorted((a, b) => a - b),
  );
  // With no vector in the table at all, it's the search by name.
  await pool.query('UPDATE products SET embedding = NULL');
  assert.deepEqual(
    (await searchProductsByMeaning('scarf')).map(({ name, distance }) => [name, distance]),
    [
      ['Scarf', null],
      ['Silk scarf', null],
    ],
  );
});

test('with SEMANTIC_SEARCH=no, searchCatalogue searches by name and computes no vector', async () => {
  await fillVectors();
  embedder.requests.length = 0;
  config.SEMANTIC_SEARCH = 'no';
  assert.deepEqual(await searchCatalogue('something for the cold'), []);
  assert.deepEqual(
    (await searchCatalogue('mug')).map(({ name, distance }) => ({ name, distance })),
    [{ name: 'Mug', distance: null }],
  );
  assert.deepEqual(embedder.requests, []);
  // On, by meaning.
  config.SEMANTIC_SEARCH = 'yes';
  assert.equal((await searchCatalogue('ceramic mug')).length, NEAREST);
});
// #endregion search

// #region events
test('creating a product, or changing its name or description, saves a product-vector event; the price, no', async () => {
  const created = await send('POST', '/v2/products', {
    name: 'Wool socks',
    description: 'Thick wool socks to sleep without cold feet.',
    priceCents: 900,
  });
  assert.equal(created.status, 201);
  const product = await created.json();
  assert.equal(product.description, 'Thick wool socks to sleep without cold feet.');
  assert.equal('embedding' in product, false, "the vector isn't in the responses");
  let events = await outbox();
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'product-vector');
  assert.deepEqual(Object.keys(events[0]!.data).sort(), ['changeId', 'productId', 'type']);
  assert.equal((events[0]!.data as { productId: number }).productId, product.id);

  // With its vector already computed, a price change doesn't touch it or save anything.
  await saveVectors([product.id]);
  assert.equal(
    (await send('PATCH', `/v2/products/${product.id}`, { priceCents: 950 })).status,
    200,
  );
  assert.notEqual(await vectorOf(product.id), null);
  assert.equal((await outbox()).length, 1);

  // Another description: the old vector is cleared in the same UPDATE, and another event is
  // saved, with another changeId.
  const change = await send('PATCH', `/v2/products/${product.id}`, {
    description: 'Merino wool thermal socks.',
  });
  assert.equal(change.status, 200);
  assert.equal((await change.json()).description, 'Merino wool thermal socks.');
  assert.equal(await vectorOf(product.id), null);
  events = await outbox();
  assert.equal(events.length, 2);
  const [first, second] = events.map((event) => event.data as { changeId: string });
  assert.notEqual(first!.changeId, second!.changeId);
});

test('the worker computes the vector: from the outbox event to the job and to the column', async () => {
  const res = await send('POST', '/v2/products', {
    name: 'Flask',
    description: 'Steel flask to carry hot coffee.',
    priceCents: 1700,
  });
  const { id } = await res.json();
  assert.equal(await vectorOf(id), null);
  // The relayer passes the event to the "queue": here, runJob, what the worker would do with it.
  assert.equal(await relay(50, (job) => runJob(job)), 1);
  assert.deepEqual(embedder.requests, [['Flask. Steel flask to carry hot coffee.']]);
  almostEqual((await vectorOf(id))!, fakeVector('Flask. Steel flask to carry hot coffee.'));
});

test("with SEMANTIC_SEARCH=no, the worker doesn't compute the vector", async () => {
  config.SEMANTIC_SEARCH = 'no';
  await runJob({ type: 'product-vector', productId: 2, changeId: 'test' });
  assert.equal(await vectorOf(2), null);
  assert.deepEqual(embedder.requests, []);
});

test("if the product changes while its vector is computed, the old vector isn't saved", async () => {
  // An embedder that, while it "computes", sees someone change the product's name.
  const slow: Embedder = {
    async vectors(texts) {
      await pool.query(`UPDATE products SET name = 'Big mug' WHERE id = 2`);
      return texts.map(fakeVector);
    },
  };
  useEmbedder(slow);
  try {
    assert.equal(await saveVectors([2]), 0);
    assert.equal(await vectorOf(2), null);
  } finally {
    await pool.query(`UPDATE products SET name = 'Mug' WHERE id = 2`);
  }
});

const url = process.env.REDIS_URL_TESTS;
const noRedis = url
  ? false
  : 'no Redis: set REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to try it';

// With Redis, the whole path: the relayer enqueues in BullMQ and a real worker (in this process,
// with the fake embedder) takes the job and saves the vector.
let client: RedisClient;
let queue: Queue<Job>;
before(async () => {
  if (!url) return;
  client = connectRedis(url);
  queue = new Queue<Job>(QUEUE_NAME, { connection: client, defaultJobOptions: JOB_OPTIONS });
  await queue.obliterate({ force: true });
});
after(async () => {
  await queue?.close();
  await client?.close();
});

test(
  'with Redis: the event reaches the queue and the worker saves the vector',
  { skip: noRedis },
  async () => {
    const worker = createWorker({ url: url! });
    try {
      const res = await send('POST', '/v2/products', { name: 'Checked scarf', priceCents: 2400 });
      const { id } = await res.json();
      assert.equal(await relay(50, (job) => enqueue(job, queue)), 1);
      for (let attempt = 0; attempt < 50 && (await vectorOf(id)) === null; attempt++) {
        await new Promise((ready) => setTimeout(ready, 100));
      }
      almostEqual((await vectorOf(id))!, fakeVector('Checked scarf'));
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
    }
  },
);
// #endregion events

// #region fill
test('npm run embeddings (fillVectors): the missing ones, 32 at a time; with all, the others too', async () => {
  await pool.query(
    `INSERT INTO products (name, price_cents)
     SELECT 'Sticker ' || n, 200 FROM generate_series(1, 40) AS n`,
  );
  // The 20 practice ones, the 40 stickers and the ones the tests above created.
  const total = (await pool.query('SELECT count(*)::int AS n FROM products')).rows[0].n;
  assert.ok(total > BATCH && total <= 2 * BATCH);
  assert.equal(await fillVectors(), total);
  assert.deepEqual(
    embedder.requests.map((texts) => texts.length),
    [BATCH, total - BATCH],
  );
  almostEqual(
    (await vectorOf(5))!,
    fakeVector(
      productText({
        name: 'Scarf',
        description: 'Long, soft and cosy scarf of thick wool, for winter days.',
      }),
    ),
  );
  // None missing any more.
  assert.equal(await fillVectors(), 0);
  // One that changes (its vector back to NULL): only that one.
  await pool.query(`UPDATE products SET embedding = NULL WHERE id = 3`);
  embedder.requests.length = 0;
  assert.equal(await fillVectors(), 1);
  assert.equal(
    embedder.requests[0]![0],
    productText({
      name: 'Hoodie',
      description: 'Thick cotton hoodie with a front pocket, to keep warm when it gets chilly.',
    }),
  );
  // With all, all of them again.
  assert.equal(await fillVectors(true), total);
  await pool.query(`DELETE FROM products WHERE name LIKE 'Sticker %'`);
});

test("npm run embeddings with SEMANTIC_SEARCH=no, or without it: it doesn't load the model, and exits with 1", async () => {
  const result = await run('node', ['scripts/embeddings.ts'], {
    env: { ...process.env, SEMANTIC_SEARCH: 'no' },
  }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /SEMANTIC_SEARCH=no: the shop doesn't use the vectors/);
  // Without the variable, the same: unless told otherwise, it's off (config.ts).
  const withoutIt = { ...process.env };
  delete withoutIt.SEMANTIC_SEARCH;
  const byDefault = await run('node', ['scripts/embeddings.ts'], { env: withoutIt }).catch(
    (error) => error,
  );
  assert.equal(byDefault.code, 1);
  assert.match(byDefault.stderr, /SEMANTIC_SEARCH=no: the shop doesn't use the vectors/);
  const other = await run('node', ['scripts/embeddings.ts', '--every']).catch((error) => error);
  assert.equal(other.code, 1);
  assert.match(other.stderr, /Invalid argument/);
});
// #endregion fill

// #region doors
test('the assistant: search_products gives the model the nearest ones, with their distance', async () => {
  await fillVectors();
  model.script(
    asksForTools(
      toolUseBlock('search_products', { query: 'a thick wool scarf for winter' }, 'toolu_1'),
    ),
    text('I recommend the Scarf.'),
  );
  const res = await app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: JSON.stringify({
      messages: [{ role: 'user', text: 'What should I get for the cold?' }],
    }),
  });
  assert.equal(res.status, 200);
  // The definition the model saw: the search by meaning's.
  const tool = model.requests[0]!.body.tools.find(
    (definition: { name: string }) => definition.name === 'search_products',
  );
  assert.equal(tool.description, DESCRIPTION_BY_MEANING);
  // What it got in the second round: the NEAREST products, the Scarf first.
  const [result] = model.requests[1]!.body.messages.at(-1).content;
  const found = JSON.parse(result.content);
  assert.equal(found.length, NEAREST);
  assert.equal(found[0].name, 'Scarf');
  assert.equal(typeof found[0].distance, 'number');
});

test('MCP: search_products searches by meaning, with the same function', async () => {
  await fillVectors();
  let server: ServerType;
  await new Promise<void>((ready) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => ready());
  });
  const address = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/mcp`;
  const mcp = new Client({ name: 'shop-tests', version: '1.0.0' });
  try {
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(address), { requestInit: { headers: catalogue } }),
    );
    const { tools } = await mcp.listTools();
    assert.equal(
      tools.find((t) => t.name === 'search_products')!.description,
      DESCRIPTION_BY_MEANING,
    );
    const result = (await mcp.callTool({
      name: 'search_products',
      arguments: { query: 'a thick wool scarf for winter' },
    })) as CallToolResult;
    const found = JSON.parse((result.content[0] as { text: string }).text);
    assert.deepEqual(found, await searchCatalogue('a thick wool scarf for winter'));
    assert.equal(found[0].name, 'Scarf');
  } finally {
    await mcp.close();
    await new Promise((closed) => server!.close(closed));
  }
});
// #endregion doors
