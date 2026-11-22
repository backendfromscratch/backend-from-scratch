// The assistant is optional (Phase 11): without ANTHROPIC_API_KEY, the shop starts and works, and
// only POST /v2/assistant says there isn't one. Each case starts the shop in another process, with
// whichever environment applies: the configuration is read when it's imported (as in
// optional-provider.test.ts). And the same to try the times with another configuration than
// test/.env's.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_WAIT } from '../src/assistant/errors.ts';
import { useDb } from './db.ts';
import { CARMEN } from './identities.ts';
import { rateLimited, startFakeModel, text } from './fake-model.ts';

useDb();

const execute = promisify(execFile);

// Imports the shop in another process, opens a session for Carmen, makes the requests with it and
// writes their responses as JSON.
const fromAnotherProcess = async (requests: [string, RequestInit?][], env: NodeJS.ProcessEnv) => {
  const program = `
    const { app } = await import('./src/app.ts');
    const { pool } = await import('./src/db.ts');
    const { createSession } = await import('./src/sessions.ts');
    const session = { Cookie: 'session=' + (await createSession(${CARMEN})), Origin: 'http://localhost:3000' };
    const responses = [];
    for (const [path, options = {}] of ${JSON.stringify(requests)}) {
      const res = await app.request(path, { ...options, headers: { ...options.headers, ...session } });
      responses.push({
        status: res.status,
        retryAfter: res.headers.get('retry-after'),
        body: res.headers.get('content-type')?.includes('json') ? await res.json() : null,
      });
    }
    await pool.end();
    console.log(JSON.stringify(responses));
  `;
  const { stdout } = await execute('node', ['--input-type=module', '-e', program], { env });
  return JSON.parse(stdout) as {
    status: number;
    retryAfter: string | null;
    body: Record<string, unknown> | null;
  }[];
};

const question: [string, RequestInit] = [
  '/v2/assistant',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', text: 'Hi' }] }),
  },
];

const withoutKey = () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
};

const NONE = {
  type: 'https://shop.example/problems/assistant-not-configured',
  title: 'The shop has no assistant',
  status: 503,
};

test('without ANTHROPIC_API_KEY, the assistant answers 503 assistant-not-configured, and the rest of the shop works', async () => {
  const [assistant, products, orders] = await fromAnotherProcess(
    [question, ['/v2/products'], ['/v2/orders']],
    withoutKey(),
  );
  assert.equal(assistant!.status, 503);
  assert.partialDeepStrictEqual(assistant!.body, NONE);
  // Waiting won't fix it: no Retry-After.
  assert.equal(assistant!.retryAfter, null);
  assert.equal(products!.status, 200);
  assert.equal(orders!.status, 200);
});

test('an empty ANTHROPIC_API_KEY (as in .env.example) is the same as not having it', async () => {
  const [assistant] = await fromAnotherProcess([question], {
    ...process.env,
    ANTHROPIC_API_KEY: '',
  });
  assert.equal(assistant!.status, 503);
  assert.partialDeepStrictEqual(assistant!.body, NONE);
});

test('with the key and nobody answering at ANTHROPIC_BASE_URL (a network cut): 503 with Retry-After', async () => {
  // test/.env points ANTHROPIC_BASE_URL at a port where nobody listens.
  const [assistant] = await fromAnotherProcess([question], {
    ...process.env,
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    LOG_LEVEL: 'silent',
  });
  assert.equal(assistant!.status, 503);
  assert.equal(assistant!.body!.type, 'https://shop.example/problems/assistant-not-available');
  assert.equal(assistant!.retryAfter, String(DEFAULT_WAIT));
});

test("with retries, the SDK would wait a 429's retry-after (30 s): the assistant's time limit cuts it", async () => {
  const model = await startFakeModel();
  try {
    model.script(rateLimited(30), text('Hi'));
    const before = Date.now();
    const [assistant] = await fromAnotherProcess([question], {
      ...process.env,
      ANTHROPIC_BASE_URL: model.url,
      MODEL_RETRIES: '2',
      ASSISTANT_TIMEOUT_MS: '1000',
      LOG_LEVEL: 'silent',
    });
    const seconds = (Date.now() - before) / 1000;
    assert.equal(assistant!.status, 503);
    assert.equal(assistant!.body!.type, 'https://shop.example/problems/assistant-not-available');
    assert.match(String(assistant!.body!.detail), /not answering/);
    // The SDK was going to repeat the request after 30 seconds; after one, the shop stopped
    // waiting (the rest is starting the other process).
    assert.equal(model.requests.length, 1);
    assert.ok(seconds < 15, `${seconds} seconds`);
  } finally {
    await model.close();
  }
});
