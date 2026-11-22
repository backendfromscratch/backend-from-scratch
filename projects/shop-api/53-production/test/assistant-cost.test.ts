// What the assistant costs (Phase 11, lesson 7): the cost of each call to the model in the log, the
// cache's tokens in the answer, the cache mark in the request and each customer's daily budget.
// Against the fake model (fake-model.ts): it's started first, and then the shop is imported, which
// creates the SDK client with ANTHROPIC_BASE_URL.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import type Anthropic from '@anthropic-ai/sdk';
import {
  BudgetUnavailable,
  createBudget,
  createMemoryBudgetStore,
  utcDay,
} from '../src/assistant/budget.ts';
import { modelRequest } from '../src/assistant/conversation.ts';
import {
  addUsage,
  costInDollars,
  NO_USAGE,
  priceOf,
  tokensOf,
  usageOf,
} from '../src/assistant/cost.ts';
import { PRICES } from '../src/config.ts';
import { useEmbedder } from '../src/embeddings.ts';
import { useDb } from './db.ts';
import { createFakeEmbedder } from './fake-embedder.ts';
import { asUser, CARMEN, PABLO } from './identities.ts';
import {
  asksForTools,
  message,
  rateLimited,
  startFakeModel,
  text,
  toolUseBlock,
} from './fake-model.ts';

const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => model.reset());
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { matchesContract } = await import('./contract.ts');
const { createMemoryStore, store } = await import('../src/rate-limits.ts');
const { budget, budgetStore } = await import('../src/assistant/budget.ts');
const { connectRedis, createRedisBudgetStore } = await import('../src/redis-store.ts');

// search_products searches by meaning (test/.env): with the fake embedder, never the real model.
useEmbedder(createFakeEmbedder());

// Each test, with no questions noted in the limits and no tokens in the budgets: both stores are in
// memory in the tests (there's no REDIS_URL), and their functions are swapped for those of empty
// ones.
beforeEach(() => {
  Object.assign(store, createMemoryStore());
  Object.assign(budgetStore, createMemoryBudgetStore());
});

let carmen: Record<string, string>;
let pablo: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
  pablo = await asUser(PABLO);
});

const ask = (
  headers: Record<string, string> = carmen,
  accept = 'application/json',
  question = 'Do you have mugs?',
) =>
  app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...headers },
    body: JSON.stringify({ messages: [{ role: 'user', text: question }] }),
  });

// The tokens a customer has today in their budget, looking at the store.
const spentToday = (customerId: number) =>
  budgetStore.spent(`${customerId}:${utcDay(Date.now()).day}`);

const linesOf = (spy: ReturnType<typeof mock.method>, msg: string) =>
  spy.mock.calls
    .filter((call) => call.arguments[1] === msg)
    .map((call) => call.arguments[0] as Record<string, any>);

// #region cost
test("usageOf: usage's four kinds of token, with 0 if the cache ones don't come", () => {
  const usage = {
    input_tokens: 112,
    output_tokens: 38,
    cache_read_input_tokens: 1650,
    cache_creation_input_tokens: null,
  } as Anthropic.Usage;
  assert.deepEqual(usageOf(usage), { input: 112, output: 38, cacheRead: 1650, cacheWrite: 0 });
});

test('costInDollars: each kind of token at its price per million (Haiku 5.5)', () => {
  const haiku = PRICES['claude-haiku-5-5']!;
  // The prices on the pricing page (2026-11-21): the cache, 1.25 and 0.1 times the input.
  assert.deepEqual(haiku, { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 });
  // (1000 × 0.10 + 500 × 0.125 + 2000 × 0.01 + 200 × 0.50) / 1,000,000 = $0.0002825
  const usage = { input: 1000, output: 200, cacheRead: 2000, cacheWrite: 500 };
  assert.equal(costInDollars(usage, haiku), 0.0002825);
  // A million output tokens, $0.50; without tokens, nothing.
  assert.equal(costInDollars({ ...NO_USAGE, output: 1_000_000 }, haiku), 0.5);
  assert.equal(costInDollars(NO_USAGE, haiku), 0);
  // Without the decimal noise: 3 calls of $0.1 are $0.3, not 0.30000000000000004.
  const aTenth = { ...NO_USAGE, input: 1_000_000 };
  const three = addUsage(addUsage(aTenth, aTenth), aTenth);
  assert.equal(costInDollars(three, haiku), 0.3);
});

test('tokensOf: the budget counts everything the model reads and writes, with the cache or without it', () => {
  assert.equal(tokensOf({ input: 112, output: 38, cacheRead: 1650, cacheWrite: 10 }), 1810);
});

test("priceOf: the one of the model that answered; if it isn't in PRICES, MODEL's", () => {
  assert.equal(priceOf('claude-sonnet-5-5').input, 2);
  assert.equal(priceOf('a-model-that-does-not-exist'), PRICES[config.MODEL]);
});

test("a MODEL without a price in PRICES: the shop doesn't start, and says what's missing", async () => {
  const result = await promisify(execFile)(
    'node',
    ['--input-type=module', '-e', "await import('./src/config.ts')"],
    { env: { ...process.env, MODEL: 'claude-other' } },
  ).catch((error) => error);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /MODEL: claude-other has no price/);
});
// #endregion cost

// #region log
test('every call to the model leaves a line in the log: the requestId, the model, the usage and the cost', async () => {
  const info = mock.method(log, 'info', () => {});
  try {
    model.script(
      text('Yes, the Mug.', {
        usage: { input: 1000, output: 200, cacheRead: 2000, cacheWrite: 500 },
      }),
    );
    const res = await ask();
    assert.equal(res.status, 200);
    const [line, ...others] = linesOf(info, 'call to the model');
    assert.equal(others.length, 0);
    assert.deepEqual(line, {
      requestId: res.headers.get('x-request-id'),
      model: 'claude-haiku-5-5',
      message: 'msg_fake_1',
      usage: { input: 1000, output: 200, cacheRead: 2000, cacheWrite: 500 },
      costUsd: 0.0002825,
    });
    // Not the conversation: it's the customer's.
    assert.ok(!JSON.stringify(line).includes('mugs'));
  } finally {
    info.mock.restore();
  }
});

test('with tools, one line per round, and usage adds both, the cache too', async () => {
  const info = mock.method(log, 'info', () => {});
  try {
    model.script(
      // The first time, the instructions and the tools are stored in the cache (cacheWrite); in the
      // second round, they're read from it (cacheRead).
      message([toolUseBlock('search_products', { query: 'mug' })], {
        stopReason: 'tool_use',
        usage: { input: 112, output: 30, cacheWrite: 1650 },
      }),
      text('Yes, the Mug.', { usage: { input: 300, output: 20, cacheRead: 1650 } }),
    );
    const res = await ask();
    const { usage } = await res.json();
    assert.deepEqual(usage, { input: 412, output: 50, cacheRead: 1650, cacheWrite: 1650 });
    const lines = linesOf(info, 'call to the model');
    assert.deepEqual(
      lines.map((line) => line.message),
      ['msg_fake_1', 'msg_fake_2'],
    );
  } finally {
    info.mock.restore();
  }
});
// #endregion log

// #region cache
test('the cache mark: only one, on the instructions (it stores the tools and the instructions)', () => {
  const request = modelRequest(
    [{ role: 'user', content: 'Hi' }],
    'You are the assistant.',
    { model: 'claude-haiku-5-5', effort: 'low' },
    [{ name: 'search', input_schema: { type: 'object' } }],
  );
  assert.deepEqual(request.system, [
    { type: 'text', text: 'You are the assistant.', cache_control: { type: 'ephemeral' } },
  ]);
  // Neither on the tools nor on the conversation, which changes in every question.
  assert.equal(JSON.stringify(request).match(/cache_control/g)!.length, 1);
});

test("in a question's two rounds with tools, what goes before the mark is identical", async () => {
  model.script(
    asksForTools(toolUseBlock('search_products', { query: 'mug' })),
    text('Yes, the Mug.'),
  );
  await (await ask()).arrayBuffer();
  const [first, second] = model.requests.map((request) => request.body);
  // What the cache stores: the tools and the instructions, byte for byte the same.
  const prefix = (body: { tools: unknown; system: unknown }) =>
    JSON.stringify({ tools: body.tools, system: body.system });
  assert.equal(prefix(first), prefix(second));
  assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral' });
  // The mark, only there: neither on the tools nor on the messages.
  for (const body of [first, second]) {
    assert.ok(!JSON.stringify(body.tools).includes('cache_control'));
    assert.ok(!JSON.stringify(body.messages).includes('cache_control'));
  }
});
// #endregion cache

// #region pure-budget
test('utcDay: the day and its midnight in UTC, also at the end of a month and a year', () => {
  assert.deepEqual(utcDay(Date.UTC(2026, 10, 21, 23, 59, 30)), {
    day: '2026-11-21',
    midnight: Date.UTC(2026, 10, 22),
  });
  assert.deepEqual(utcDay(Date.UTC(2026, 11, 31, 12)), {
    day: '2026-12-31',
    midnight: Date.UTC(2027, 0, 1),
  });
});

test('the budget: lets through until the maximum is reached, and then says how long it is until midnight', async () => {
  let now = Date.UTC(2026, 10, 21, 23, 59, 0);
  const testStore = createMemoryBudgetStore(() => now);
  const b = createBudget({ max: 1000, store: testStore, clock: () => now });
  assert.deepEqual(await b.check(7), { allowed: true, spent: 0, max: 1000, retryAfter: 0 });
  await b.charge(7, 600);
  assert.equal((await b.check(7)).allowed, true);
  // The last question can go over: it's checked before and charged after.
  await b.charge(7, 600);
  assert.deepEqual(await b.check(7), { allowed: false, spent: 1200, max: 1000, retryAfter: 60 });
  // Another customer, their own count.
  assert.equal((await b.check(8)).allowed, true);
  // At midnight, a new day: a new count.
  now = Date.UTC(2026, 10, 22, 0, 0, 1);
  assert.equal((await b.check(7)).spent, 0);
});

test('the budget, with no store that answers in time: it closes (throws), and charge only warns', async () => {
  const frozen = {
    spent: () => new Promise<number>(() => {}),
    add: () => new Promise<void>(() => {}),
  };
  const b = createBudget({ max: 1000, store: frozen, wait: 50 });
  const before = performance.now();
  await assert.rejects(b.check(7), BudgetUnavailable);
  assert.ok(performance.now() - before < 500);
  const warning = mock.method(log, 'warn', () => {});
  try {
    await b.charge(7, 100, { requestId: 'r1' });
    assert.equal(
      linesOf(warning, "what was spent couldn't be noted in the customer's budget").length,
      1,
    );
  } finally {
    warning.mock.restore();
  }
});
// #endregion pure-budget

// #region route-budget
test("every call is charged to the customer's budget: all its tokens, the cache ones too", async () => {
  model.script(
    asksForTools(toolUseBlock('search_products', { query: 'mug' })),
    text('Yes, the Mug.', { usage: { input: 300, output: 20, cacheRead: 1650 } }),
  );
  await (await ask()).arrayBuffer();
  // 120 + 30 from the first round (what the fake model gives if not told), and 300 + 20 + 1650.
  assert.equal(await spentToday(CARMEN), 150 + 1970);
  assert.equal(await spentToday(PABLO), 0);
});

test("with today's budget spent: 429 budget-exhausted, Retry-After until midnight, and the model never hears about it", async () => {
  await budget.charge(CARMEN, config.DAILY_TOKEN_BUDGET);
  const res = await ask();
  assert.equal(res.status, 429);
  const body = await res.clone().json();
  assert.equal(body.type, 'https://shop.example/problems/budget-exhausted');
  assert.match(body.detail, /100000 assistant tokens/);
  const { midnight } = utcDay(Date.now());
  const seconds = Number(res.headers.get('retry-after'));
  assert.ok(Math.abs(seconds - (midnight - Date.now()) / 1000) < 5, `${seconds} s`);
  assert.equal(model.requests.length, 0);
  await matchesContract(res, 'post', '/assistant');
  // Streaming, the same: a normal 429, before any stream starts.
  assert.equal((await ask(carmen, 'text/event-stream')).status, 429);
  // Pablo still has his.
  model.script(text('Hi, Pablo!'));
  assert.equal((await ask(pablo)).status, 200);
});

test('with Redis frozen, the budget closes: 503 budget-unchecked, without calling the model', async () => {
  Object.assign(budgetStore, { spent: () => new Promise<number>(() => {}) });
  const warning = mock.method(log, 'warn', () => {});
  try {
    const before = performance.now();
    const res = await ask();
    assert.ok(performance.now() - before < 1000);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '5');
    const body = await res.clone().json();
    assert.equal(body.type, 'https://shop.example/problems/budget-unchecked');
    assert.equal(model.requests.length, 0);
    await matchesContract(res, 'post', '/assistant');
  } finally {
    warning.mock.restore();
  }
});

test("if charging fails, the answer arrives all the same (it's already paid for), and a warning stays in the log", async () => {
  Object.assign(budgetStore, { add: () => Promise.reject(new Error('Redis down')) });
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(text('Yes, the Mug.'));
    const res = await ask();
    assert.equal(res.status, 200);
    const [line] = linesOf(warning, "what was spent couldn't be noted in the customer's budget");
    assert.equal(line!.requestId, res.headers.get('x-request-id'));
    assert.equal(line!.tokens, 150);
  } finally {
    warning.mock.restore();
  }
});

test('a stream the customer cuts halfway is charged all the same: the input, from the first event', async () => {
  model.script(
    text('Let me tell you everything we have for the cold, one thing after another.', {
      pause: 30,
    }),
  );
  const res = await ask(carmen, 'text/event-stream');
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let read = '';
  while (!read.includes('event: text')) read += (await reader.read()).value;
  await reader.cancel();
  assert.equal(await model.requests[0]!.finished, 'cut');
  // What was known when it was cut: the 120 of input (and the 1 of output message_start brings as a
  // placeholder, until the real one arrives).
  for (let ms = 0; (await spentToday(CARMEN)) === 0 && ms < 1000; ms += 10) await sleep(10);
  assert.ok((await spentToday(CARMEN)) >= 120, `${await spentToday(CARMEN)} tokens`);
});

test("a call that fails before answering (a 429 from the API) isn't charged: the API doesn't charge it", async () => {
  model.script(rateLimited(10));
  assert.equal((await ask()).status, 503);
  assert.equal(await spentToday(CARMEN), 0);
});
// #endregion route-budget

// #region redis-budget
const url = process.env.REDIS_URL_TESTS;
test(
  "the budget's store in Redis: INCRBY adds and PEXPIREAT sets the expiry",
  { skip: url ? false : 'no Redis: set REDIS_URL_TESTS in test/.env to try it' },
  async () => {
    const client = connectRedis(url!);
    const prefix = `test-budget-${process.pid}:`;
    try {
      const inRedis = createRedisBudgetStore(client, prefix);
      const expiresAt = Date.now() + 60_000;
      assert.equal(await inRedis.spent('7:2026-11-21'), 0);
      await inRedis.add('7:2026-11-21', 1200, expiresAt);
      await inRedis.add('7:2026-11-21', 300, expiresAt);
      assert.equal(await inRedis.spent('7:2026-11-21'), 1500);
      const left = await client.pTTL(`${prefix}7:2026-11-21`);
      assert.ok(left > 50_000 && left <= 60_000, `${left} ms`);
    } finally {
      await client.del(`${prefix}7:2026-11-21`);
      client.destroy();
    }
  },
);
// #endregion redis-budget
