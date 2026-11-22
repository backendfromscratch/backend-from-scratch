// A product's description written by the model (Phase 11, lesson 7): the route that requests it
// (POST /v2/products/{id}/description) and the job that writes it (assistant/description.ts),
// against the fake model. With Redis (REDIS_URL_TESTS), also through the real queue, with a worker
// and its retries.
import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { useDb } from './db.ts';
import { ANA, CARMEN, asUser } from './identities.ts';
import { overloaded, refusal, startFakeModel, text } from './fake-model.ts';

const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => model.reset());
const { app } = await import('../src/app.ts');
const { pool } = await import('../src/db.ts');
const { log } = await import('../src/log.ts');
const { writeDescription } = await import('../src/assistant/description.ts');
const { connectRedis } = await import('../src/redis-store.ts');
const { createQueue, createWorker, runJob } = await import('../src/queue.ts');
const { matchesContract } = await import('./contract.ts');

let ana: Record<string, string>;
let carmen: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
  carmen = await asUser(CARMEN);
});

const request = (id: number, headers: Record<string, string> = ana) =>
  app.request(`/v2/products/${id}/description`, { method: 'POST', headers });

const descriptionOf = async (id: number) =>
  (
    await pool.query<{ d: string | null }>('SELECT description AS d FROM products WHERE id = $1', [
      id,
    ])
  ).rows[0]?.d;

// The unsent outbox events of a type (outbox.ts).
const pending = async (type: string) =>
  (
    await pool.query<{ data: any }>(
      'SELECT data FROM outbox_events WHERE type = $1 AND sent_at IS NULL ORDER BY id',
      [type],
    )
  ).rows.map((row) => row.data);

const markSent = () => pool.query('UPDATE outbox_events SET sent_at = now() WHERE sent_at IS NULL');

// #region route
test('requesting the description: 202, Location of the product, and an outbox event for the worker', async () => {
  await markSent();
  const res = await request(3);
  assert.equal(res.status, 202);
  assert.deepEqual(await res.clone().json(), { productId: 3, status: 'queued' });
  assert.equal(res.headers.get('location'), '/v2/products/3');
  await matchesContract(res, 'post', '/products/{id}/description');
  const [event, ...others] = await pending('product-description');
  assert.equal(others.length, 0);
  assert.equal(event.productId, 3);
  assert.match(event.taskId, /^[0-9a-f-]{36}$/);
  // The route doesn't call the model: that's the worker's.
  assert.equal(model.requests.length, 0);
});

test("only admin: a customer, 403; without identifying, 401; a product that doesn't exist, 404", async () => {
  assert.equal((await request(3, carmen)).status, 403);
  assert.equal((await request(3, {})).status, 401);
  const missing = await request(999);
  assert.equal(missing.status, 404);
  await matchesContract(missing, 'post', '/products/{id}/description');
});
// #endregion route

// #region job
test('the job: asks for the description with the product data, saves it and requests the new vector', async () => {
  await markSent();
  const info = mock.method(log, 'info', () => {});
  try {
    const fresh = 'Thick hoodie with a hood and a front pocket, for when it gets chilly.';
    model.script(text(`  ${fresh}\n`, { usage: { input: 400, output: 40 } }));
    await runJob({ type: 'product-description', productId: 3, taskId: 't1' });
    // Saved, without the spaces at the sides (the same schema as one written by hand).
    assert.equal(await descriptionOf(3), fresh);
    // Like any description change: its vector, to compute again (lesson 5).
    const [vector] = await pending('product-vector');
    assert.equal(vector.productId, 3);
    // The request: its instructions, the product data as JSON and no tools.
    const { body } = model.requests[0]!;
    assert.equal(body.model, 'claude-haiku-5-5');
    assert.match(body.system, /You write the product descriptions/);
    assert.equal(body.tools, undefined);
    assert.deepEqual(JSON.parse(body.messages[0].content), {
      name: 'Hoodie',
      priceCents: 3500,
      categories: ['Clothing'],
      description: 'Thick cotton hoodie with a front pocket, to keep warm when it gets chilly.',
    });
    // What it cost, to the log, like the assistant's calls.
    const [line] = info.mock.calls
      .filter((call) => call.arguments[1] === 'call to the model')
      .map((call) => call.arguments[0] as Record<string, unknown>);
    assert.partialDeepStrictEqual(line, {
      job: 'product-description',
      productId: 3,
      costUsd: 0.00006,
    });
  } finally {
    info.mock.restore();
  }
});

test("a description that isn't valid (over 500 characters) isn't saved: the job fails, and the queue will repeat it", async () => {
  const before = await descriptionOf(2);
  model.script(text('a'.repeat(501)));
  await assert.rejects(
    runJob({ type: 'product-description', productId: 2, taskId: 't2' }),
    /didn't write a valid description/,
  );
  assert.equal(await descriptionOf(2), before);
});

test('if the model refuses, nothing is saved or repeated: a warning in the log', async () => {
  const before = await descriptionOf(2);
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(refusal());
    await writeDescription(2);
    assert.equal(await descriptionOf(2), before);
    assert.equal(
      warning.mock.calls.filter(
        (call) => call.arguments[1] === 'the model refused to write the description',
      ).length,
      1,
    );
  } finally {
    warning.mock.restore();
  }
});

test('a product that no longer exists: the model is not called', async () => {
  await writeDescription(999);
  assert.equal(model.requests.length, 0);
});

test("a 529 from the model: the error comes out of the job (with MODEL_RETRIES=0, without the SDK's retries)", async () => {
  model.script(overloaded());
  await assert.rejects(writeDescription(2), { status: 529 });
});
// #endregion job

// #region queue
const url = process.env.REDIS_URL_TESTS;
test(
  'through the real queue: the model fails once (529), BullMQ retries it and the description is saved',
  { skip: url ? false : 'no Redis: set REDIS_URL_TESTS in test/.env to try it' },
  async () => {
    const connection = connectRedis(url!);
    const queue = createQueue(connection);
    await queue.obliterate({ force: true });
    const worker = createWorker({ url });
    const warning = mock.method(log, 'warn', () => {});
    try {
      const fresh = 'Ceramic mug for the morning coffee, and a nice gift.';
      model.script(overloaded(), text(fresh));
      await queue.add(
        'product-description',
        { type: 'product-description', productId: 2, taskId: 't3' },
        { jobId: 'description-2-t3' },
      );
      // The first attempt fails; the second, a second later (JOB_OPTIONS' wait), works.
      for (let ms = 0; (await descriptionOf(2)) !== fresh; ms += 100) {
        if (ms > 10_000) assert.fail("the description wasn't saved in 10 seconds");
        await sleep(100);
      }
      assert.equal(model.requests.length, 2);
      const failures = warning.mock.calls.filter(
        (call) => call.arguments[1] === 'job failed: it will be retried',
      );
      assert.equal(failures.length, 1);
    } finally {
      warning.mock.restore();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      connection.destroy();
    }
  },
);
// #endregion queue
