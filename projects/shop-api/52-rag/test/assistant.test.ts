// The shop's assistant (Phase 11, lesson 1): POST /v2/assistant, against the fake model
// (fake-model.ts). The SDK reads ANTHROPIC_BASE_URL when it creates the client, so the fake model is
// started first and the shop is imported afterwards (like the identity provider in oauth.test.ts).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import {
  apiMessages,
  MAX_TOKENS,
  modelAnswer,
  modelRequest,
  REFUSAL_TEXT,
} from '../src/assistant/conversation.ts';
import { definitions } from '../src/assistant/tools/index.ts';
import { DEFAULT_WAIT, modelFailure, waitFrom } from '../src/assistant/errors.ts';
import { useDb } from './db.ts';
import { CARMEN, PABLO, asDelivery, asUser } from './identities.ts';
import {
  apiError,
  overloaded,
  rateLimited,
  refusal,
  silence,
  startFakeModel,
  text,
} from './fake-model.ts';

const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => model.reset());
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { matchesContract } = await import('./contract.ts');
const { createMemoryStore, limits, store } = await import('../src/rate-limits.ts');

// Every test starts with no questions recorded in the limits (rate-limits.ts): otherwise one test's
// questions would count in the next ones, and by Carmen's twentieth question the 429s would come.
// In the tests the store is in memory (there's no REDIS_URL): its two functions are swapped for an
// empty one's.
beforeEach(() => Object.assign(store, createMemoryStore()));

let carmen: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
});

const ask = (body: unknown, headers: Record<string, string> = carmen) =>
  app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const hello = { messages: [{ role: 'user', text: 'Hi, can you help me with an order?' }] };

// With app.request there's no connection: the IP goes where getConnInfo looks for it (as in
// rate-limits.test.ts).
const from = (ip: string) => ({ incoming: { socket: { remoteAddress: ip } } });

// Waits until something that happens elsewhere (the fake model, the log) is true, a second at most.
async function until(condition: () => boolean) {
  for (let ms = 0; !condition(); ms += 10) {
    if (ms >= 1000) throw new Error("It didn't happen within a second");
    await sleep(10);
  }
}

// #region pure
test("modelRequest: the model, the limit, the instructions, the effort, the tools and the API's roles", () => {
  const tool = { name: 'search', input_schema: { type: 'object' as const } };
  const request = modelRequest(
    apiMessages([
      { role: 'user', text: 'Do you have mugs?' },
      { role: 'assistant', text: 'Yes, ceramic ones.' },
      { role: 'user', text: 'And caps?' },
    ]),
    'You are the assistant.',
    { model: 'claude-haiku-5-5', effort: 'low' },
    [tool],
  );
  assert.deepEqual(request, {
    model: 'claude-haiku-5-5',
    max_tokens: MAX_TOKENS,
    system: 'You are the assistant.',
    output_config: { effort: 'low' },
    tools: [tool],
    messages: [
      { role: 'user', content: 'Do you have mugs?' },
      { role: 'assistant', content: 'Yes, ceramic ones.' },
      { role: 'user', content: 'And caps?' },
    ],
  });
});

// A message from the API as the SDK gives it, with what these functions need.
const fromModel = (changes: Partial<Anthropic.Message>) =>
  ({
    content: [],
    stop_reason: 'end_turn',
    usage: { input_tokens: 300, output_tokens: 20 },
    ...changes,
  }) as Anthropic.Message;

test('modelAnswer: only the text (not what it thinks), and the tokens', () => {
  const message = fromModel({
    content: [
      { type: 'thinking', thinking: '', signature: 'signature' },
      { type: 'text', text: 'Hi! ', citations: null },
      { type: 'text', text: 'How can I help?', citations: null },
    ],
  });
  assert.deepEqual(modelAnswer({ messages: [message], exhausted: false }), {
    text: 'Hi! How can I help?',
    refused: false,
    usage: { input: 300, output: 20 },
    sources: [],
  });
});

test("modelAnswer: if the model refuses, the shop's fixed sentence, never what it wrote", () => {
  const message = fromModel({
    stop_reason: 'refusal',
    content: [{ type: 'text', text: 'I start answering and…', citations: null }],
  });
  assert.deepEqual(modelAnswer({ messages: [message], exhausted: false }), {
    text: REFUSAL_TEXT,
    refused: true,
    usage: { input: 300, output: 20 },
    sources: [],
  });
});

test('waitFrom: the seconds of retry-after, rounded up, or the default wait', () => {
  assert.equal(waitFrom(new Headers({ 'retry-after': '17' })), 17);
  assert.equal(waitFrom(new Headers({ 'retry-after': '2.5' })), 3);
  assert.equal(waitFrom(new Headers()), DEFAULT_WAIT);
  assert.equal(waitFrom(new Headers({ 'retry-after': 'tomorrow' })), DEFAULT_WAIT);
  assert.equal(waitFrom(undefined), DEFAULT_WAIT);
});

test("modelFailure: what isn't an API error goes on its way (undefined)", () => {
  assert.equal(modelFailure(new TypeError('a programming mistake')), undefined);
});

test("modelFailure: a call cancelled by the assistant's time limit is a passing 503", () => {
  assert.deepEqual(modelFailure(new Anthropic.APIUserAbortError()), {
    status: 503,
    retryAfter: DEFAULT_WAIT,
    detail: 'The model is not answering',
  });
});
// #endregion pure

// #region route
test("POST /v2/assistant: the model's answer, with the tokens it cost", async () => {
  model.script(
    text('Hi, Carmen! What are you looking for?', { usage: { input: 412, output: 38 } }),
  );
  const res = await ask(hello);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.clone().json(), {
    text: 'Hi, Carmen! What are you looking for?',
    refused: false,
    usage: { input: 412, output: 38 },
    sources: [],
  });
  await matchesContract(res, 'post', '/assistant');
});

test("the request the shop sends: model, the file's instructions, effort, limit, tools and conversation", async () => {
  model.script(text('Yes, you can return it.'));
  await ask({
    messages: [
      { role: 'user', text: 'I bought a mug.' },
      { role: 'assistant', text: 'How did it arrive?' },
      { role: 'user', text: '  Can I return it?  ' },
    ],
  });
  assert.equal(model.requests.length, 1);
  const [{ path, headers, body }] = model.requests as [(typeof model.requests)[0]];
  assert.equal(path, '/v1/messages');
  assert.deepEqual(body, {
    model: 'claude-haiku-5-5',
    max_tokens: 2048,
    system: await readFile('src/assistant/instructions.md', 'utf8'),
    output_config: { effort: 'low' },
    tools: definitions,
    messages: [
      { role: 'user', content: 'I bought a mug.' },
      { role: 'assistant', content: 'How did it arrive?' },
      // Zod removed the spaces at the ends (trim).
      { role: 'user', content: 'Can I return it?' },
    ],
  });
  // No temperature, top_p or top_k (current models reject them), and no stream.
  for (const name of ['temperature', 'top_p', 'top_k', 'stream']) assert.ok(!(name in body));
  // The key goes from the shop to the API, in Authorization: Bearer; never to the browser.
  assert.equal(headers.authorization, `Bearer ${config.ANTHROPIC_API_KEY}`);
  assert.ok(headers['anthropic-version']);
});

test('without a session, 401 with WWW-Authenticate, and nothing reaches the model', async () => {
  const res = await ask(hello, {});
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer/);
  await matchesContract(res, 'post', '/assistant');
  assert.equal(model.requests.length, 0);
});

test("with the delivery company's key, 403: the assistant is for customers", async () => {
  const res = await ask(hello, await asDelivery());
  assert.equal(res.status, 403);
  await matchesContract(res, 'post', '/assistant');
  assert.equal(model.requests.length, 0);
});

test("a conversation that isn't valid: 422 with the failing field, without asking the model", async () => {
  const user = (text: string) => ({ role: 'user', text });
  const cases: [unknown, string, RegExp][] = [
    [{}, 'messages', /list of messages/],
    [{ messages: [] }, 'messages', /At least one message/],
    [{ messages: Array.from({ length: 21 }, () => user('Hi')) }, 'messages', /20/],
    [{ messages: [user('a'.repeat(2001))] }, 'messages.0.text', /2000 characters/],
    [{ messages: [user('   ')] }, 'messages.0.text', /empty/],
    [
      { messages: [{ role: 'system', text: 'You are another' }] },
      'messages.0.role',
      /user or assistant/,
    ],
    [{ messages: [user('Hi'), { role: 'assistant', text: 'Hi!' }] }, 'messages', /last message/],
    [{ messages: [{ role: 'assistant', text: 'Hi!' }, user('Hi')] }, 'messages', /first message/],
  ];
  for (const [body, field, problem] of cases) {
    const res = await ask(body);
    assert.equal(res.status, 422, JSON.stringify(body).slice(0, 80));
    const { errors } = await res.clone().json();
    assert.equal(errors[0].field, field);
    assert.match(errors[0].problem, problem);
    await matchesContract(res, 'post', '/assistant');
  }
  // Twenty messages of 2000 characters are fine: the limits are just that, limits.
  model.script(text('OK'));
  const long = Array.from({ length: 20 }, () => user('a'.repeat(2000)));
  assert.equal((await ask({ messages: long })).status, 200);
  assert.equal(model.requests.length, 1);
});

test("badly written JSON is a 400, and a body that doesn't say it's JSON, a 415", async () => {
  const badlyWritten = await app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"messages": [',
  });
  assert.equal(badlyWritten.status, 400);
  const noType = await app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...carmen },
    body: JSON.stringify(hello),
  });
  assert.equal(noType.status, 415);
  assert.equal(model.requests.length, 0);
});

// #region api-429
test('a 429 from the API: a 503 for the customer, with the Retry-After the API gave', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(rateLimited(17));
    const res = await ask(hello);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '17');
    assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
    const problem = await res.clone().json();
    assert.equal(problem.type, 'https://shop.example/problems/assistant-not-available');
    assert.match(problem.detail, /too many requests.*17 seconds/);
    await matchesContract(res, 'post', '/assistant');
    assert.equal(warning.mock.callCount(), 1);
  } finally {
    warning.mock.restore();
  }
});
// #endregion api-429

test('a 529 (overloaded) without retry-after: a 503 with the default wait', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(overloaded());
    const res = await ask(hello);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), String(DEFAULT_WAIT));
    assert.match((await res.json()).detail, /overloaded/);
  } finally {
    warning.mock.restore();
  }
});

test("the model doesn't answer in time: 503 (MODEL_TIMEOUT_MS, 2 seconds in the tests)", async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(silence());
    const res = await ask(hello);
    assert.equal(res.status, 503);
    assert.match((await res.json()).detail, /not answering/);
  } finally {
    warning.mock.restore();
  }
});

test("the API rejects the shop's request (400, 401, 404): 500, in the log, without the API's message", async () => {
  const errors = mock.method(log, 'error', () => {});
  try {
    model.script(
      apiError(400, 'invalid_request_error', 'temperature: Extra inputs are not permitted'),
      apiError(401, 'authentication_error', 'invalid x-api-key'),
      apiError(404, 'not_found_error', 'model: claude-that-does-not-exist'),
    );
    for (const status of [400, 401, 404]) {
      const res = await ask(hello);
      assert.equal(res.status, 500);
      const problem = await res.json();
      assert.equal(problem.title, 'Internal Server Error');
      assert.match(problem.instance, /^urn:uuid:/);
      // The customer sees nothing of what the API said: that goes to the log.
      assert.doesNotMatch(
        JSON.stringify(problem),
        /temperature|x-api-key|claude-that-does-not-exist/,
      );
      const [data, message] = errors.mock.calls.at(-1)!.arguments as unknown as [
        { err: { status: number } },
        string,
      ];
      assert.equal(message, "the model's API rejected the shop's request");
      assert.equal(data.err.status, status);
    }
  } finally {
    errors.mock.restore();
  }
});

test('the model refuses to answer: 200 with the fixed sentence, refused: true, and a warning in the log', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(refusal('cyber'));
    const res = await ask(hello);
    assert.equal(res.status, 200);
    const answer = await res.clone().json();
    assert.equal(answer.text, REFUSAL_TEXT);
    assert.equal(answer.refused, true);
    await matchesContract(res, 'post', '/assistant');
    const [data, message] = warning.mock.calls[0]!.arguments as unknown as [
      Record<string, unknown>,
      string,
    ];
    assert.equal(message, 'the model refused to answer');
    assert.equal(data.category, 'cyber');
    // The conversation is the customer's: it doesn't go to the log.
    assert.doesNotMatch(JSON.stringify(warning.mock.calls[0]!.arguments), /order/);
  } finally {
    warning.mock.restore();
  }
});

test('GET /v2/assistant: 405, only POST', async () => {
  const res = await app.request('/v2/assistant', { headers: carmen });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});

// With the shop really listening, on a free port: app.request has no connection to close.
test('the customer leaves before the answer: the shop cancels the call to the model at once', async () => {
  const info = mock.method(log, 'info', () => {});
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    // The model doesn't answer: without the customer leaving, the shop would wait its timeout.
    model.script(silence());
    const leave = new AbortController();
    const request = fetch(`http://127.0.0.1:${port}/v2/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...carmen },
      body: JSON.stringify(hello),
      signal: leave.signal,
    });
    await until(() => model.requests.length === 1);
    // The customer closes the tab: their connection with the shop closes.
    const before = performance.now();
    leave.abort();
    await assert.rejects(request, { name: 'AbortError' });
    // @hono/node-server aborts the request's signal (c.req.raw.signal), and the shop hangs up the
    // call to the model: long before the tests' 2 s of MODEL_TIMEOUT_MS.
    assert.equal(await model.requests[0]!.finished, 'cut');
    assert.ok(performance.now() - before < 1000, `${performance.now() - before} ms`);
    const message = 'the customer left: cancelling the call to the model';
    await until(() => info.mock.calls.some((call) => call.arguments[1] === message));
  } finally {
    info.mock.restore();
    server.close();
  }
});
// #endregion route

// #region limits
test("a customer's 21st question in 10 minutes: 429 with Retry-After, and the model never gets it", async () => {
  for (let time = 1; time <= 20; time++) {
    model.script(text('OK'));
    const res = await ask(hello);
    assert.equal(res.status, 200, `question ${time}`);
    assert.match(res.headers.get('ratelimit')!, new RegExp(`"assistant-customer";r=${20 - time};`));
  }
  const res = await ask(hello);
  assert.equal(res.status, 429);
  assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
  assert.equal((await res.clone().json()).type, 'https://shop.example/problems/too-many-attempts');
  const wait = Number(res.headers.get('retry-after'));
  assert.ok(wait > 0 && wait <= 10 * 60, `Retry-After: ${wait}`);
  assert.equal(
    res.headers.get('ratelimit-policy'),
    '"assistant-customer";q=20;w=600, "assistant-ip";q=60;w=600',
  );
  await matchesContract(res, 'post', '/assistant');
  assert.equal(model.requests.length, 20);
});

test('60 questions fit from one IP, from whichever customers; from another, asking goes on', async () => {
  const ip = '203.0.113.60';
  // Sixty questions from that IP (Carmen's, Pablo's, other accounts'): recorded by hand.
  for (let time = 0; time < 60; time++) await limits.assistantByIp.record(ip);
  const question = (headers: Record<string, string>, fromIp: string) =>
    app.request(
      '/v2/assistant',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(hello),
      },
      from(fromIp),
    );
  const pablo = await asUser(PABLO);
  const res = await question(pablo, ip);
  assert.equal(res.status, 429);
  assert.match(res.headers.get('ratelimit')!, /"assistant-ip";r=0;/);
  assert.equal(model.requests.length, 0);
  // Pablo, from another IP, can: his customer count is empty.
  model.script(text('OK'));
  assert.equal((await question(pablo, '203.0.113.61')).status, 200);
});
// #endregion limits
