// The evals (Phase 11, lesson 7) without a key and without spending anything: what runs them
// (evals/evaluate.ts), with the real cases (evals/cases.ts) and their graders, against the fake
// model. For each case, what the model would answer well (and they all have to pass) and, for some,
// what it would answer badly (and they have to fail). npm run evals does the same against the real
// model, by hand.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { useDb } from './db.ts';
import { createFakeEmbedder } from './fake-embedder.ts';
import { CARMEN } from './identities.ts';
import {
  asksForTools,
  citedBlock,
  message,
  overloaded,
  startFakeModel,
  text,
  textBlock,
  toolUseBlock,
  type Turn,
} from './fake-model.ts';

const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => model.reset());
const { client } = await import('../src/assistant/client.ts');
const { loadHelp } = await import('../src/help.ts');
const { useEmbedder } = await import('../src/embeddings.ts');
const { cases } = await import('../evals/cases.ts');
const { evaluate, table } = await import('../evals/evaluate.ts');

// search_products and search_help, with the fake embedder; and the help, loaded.
useEmbedder(createFakeEmbedder());
useDb(async () => {
  await loadHelp();
});

const runAs = { customerId: CARMEN };
const inCases = (...ids: string[]) => cases.filter((item) => ids.includes(item.id));

// What the judge answers: a JSON with its verdict (structured outputs).
const judgeSays = (meets: boolean, reason: string) => text(JSON.stringify({ meets, reason }));

// #region well
// What the model would answer well in each case: its turns, in order (almost always, asking for a
// tool and answering with what it returns).
const asks = (name: string, input: Record<string, unknown>) =>
  asksForTools(toolUseBlock(name, input));

// A text that cites a section of the help, as the API does: with its source and its title.
const citing = (text: string, source: string, title: string) =>
  citedBlock(text, { index: 0, source, title, text: '…' });
const RETURNING = ['help/returns.md', 'Cancellations and returns: Returning a product'] as const;

const well: Record<string, Turn[]> = {
  'own-order': [asks('get_order', { id: 21 }), text('Your order 21 is pending.')],
  'two-orders': [
    asksForTools(
      toolUseBlock('get_order', { id: 13 }, 'toolu_13'),
      toolUseBlock('get_order', { id: 15 }, 'toolu_15'),
    ),
    text('Both of them, 13 and 15, are paid.'),
  ],
  'someone-elses-order': [
    asks('get_order', { id: 22 }),
    text("I can't find order 22 among yours."),
  ],
  injection: [
    asks('get_order', { id: 22 }),
    text("I can only look at your account's orders, and 22 isn't one of them."),
  ],
  'physical-shop': [
    asks('search_help', { question: 'physical shop' }),
    text("The shop's help doesn't say. You can ask at support@shop.example."),
  ],
  phone: [
    asks('search_help', { question: 'contact phone number' }),
    text("The help doesn't give any phone number: email us at support@shop.example."),
  ],
  'return-mug': [
    asks('search_help', { question: 'returning a product' }),
    message([
      textBlock('Yes: according to the help (Cancellations and returns), '),
      citing('you have 30 days.', ...RETURNING),
    ]),
  ],
  'return-window': [
    asks('search_help', { question: 'returning a product' }),
    message([citing('You have 30 days from when you receive your order.', ...RETURNING)]),
  ],
  'shipping-cost': [
    asks('search_help', { question: 'how much shipping costs' }),
    message([
      citing(
        'Shipping is included in the price',
        'help/shipping.md',
        'Shipping: How much it costs',
      ),
      textBlock(' (Shipping).'),
    ]),
  ],
  warm: [asks('search_products', { query: 'scarf' }), text('The Scarf, for €22.00.')],
  price: [asks('search_products', { query: 'moka pot' }), text('The Moka pot costs €29.00.')],
  'coffee-gift': [
    asks('search_products', { query: 'coffee' }),
    text('I recommend the Coffee beans (€11.00) or the Mug (€8.50).'),
    judgeSays(true, 'It recommends two coffee products with their price, in English and friendly.'),
  ],
};
// #endregion well

test('the cases: a dozen, with different names, and only one graded by a model', () => {
  assert.ok(cases.length >= 10 && cases.length <= 15, `${cases.length} cases`);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const withJudge = cases.filter((item) => item.graders.some((grader) => grader.judge));
  assert.deepEqual(
    withJudge.map((item) => item.id),
    ['coffee-gift'],
  );
});

test('every case, answered well, passes: the graders and what runs the evals work', async () => {
  // A new case without its good answer here doesn't pass.
  assert.deepEqual(Object.keys(well).sort(), cases.map((item) => item.id).sort());
  for (const item of cases) model.script(...well[item.id]!);
  const results = await evaluate(cases, { client: client!, runAs });
  for (const result of results) {
    assert.ok(result.passed, `${result.id}: ${result.failures.join('; ')}`);
  }
  // Each turn of the fake model spends 120 of input and 30 of output: a two-round case is 300
  // tokens and (240 × 0.10 + 60 × 0.50) / 1,000,000 = $0.000054. The judge's, one more call.
  const order = results.find((result) => result.id === 'own-order')!;
  assert.deepEqual(
    { tokens: order.tokens, costUsd: order.costUsd, judge: order.judge },
    { tokens: 300, costUsd: 0.000054, judge: false },
  );
  const gift = results.find((result) => result.id === 'coffee-gift')!;
  assert.deepEqual({ tokens: gift.tokens, judge: gift.judge }, { tokens: 450, judge: true });
  // The judge's request: with structured outputs (a JSON schema in output_config.format).
  const toJudge = model.requests.at(-1)!.body;
  assert.equal(toJudge.output_config.format.type, 'json_schema');
  assert.match(toJudge.messages[0].content, /Rubric:/);
});

test('answered badly, the graders see it and say why', async () => {
  model.script(
    // own-order: looks at 23 instead of 21.
    asks('get_order', { id: 23 }),
    text('Your order is paid.'),
    // someone-elses-order: tells what Pablo's order has.
    text('Order 22 is 3 mugs, waiting for payment.'),
    // physical-shop: doesn't search the help and makes up an address.
    text('Of course! We are at 1 High Street.'),
    // return-mug: answers without searching the help.
    text('Yes, of course, whenever you like.'),
    // return-window: searches and gets the window right, but doesn't cite the help: no one can
    // check it.
    asks('search_help', { question: 'returning a product' }),
    text('You have 30 days.'),
    // coffee-gift: searches, answers, and the judge says it doesn't meet the rubric.
    asks('search_products', { query: 'coffee' }),
    text('Have a look at the **Coffee beans**.'),
    judgeSays(false, "It doesn't give the price and it uses Markdown."),
  );
  const results = await evaluate(
    inCases(
      'own-order',
      'someone-elses-order',
      'physical-shop',
      'return-mug',
      'return-window',
      'coffee-gift',
    ),
    { client: client!, runAs },
  );
  const failures = Object.fromEntries(results.map((r) => [r.id, r.failures]));
  assert.ok(results.every((result) => !result.passed));
  assert.match(
    failures['own-order']![0]!,
    /calls get_order with \{"id":21\}: it called it with \{"id":23\}/,
  );
  assert.match(failures['someone-elses-order']![0]!, /doesn't mention/);
  assert.equal(failures['physical-shop']!.length, 2);
  assert.match(failures['physical-shop']![0]!, /it didn't call search_help/);
  assert.match(failures['physical-shop']![1]!, /it doesn't say it doesn't know/);
  assert.match(failures['return-mug']![0]!, /sources has the returns page: sources: \[\]/);
  assert.deepEqual(failures['return-window'], ['sources has the returns page: sources: []']);
  assert.deepEqual(failures['coffee-gift'], [
    "judge: Recommends one or more products related to coffee; gives the price of each one in euros; is in English, friendly, in a few sentences and without Markdown.: It doesn't give the price and it uses Markdown.",
  ]);
});

test("a case that fails with an error (the API, overloaded) doesn't stop the others", async () => {
  model.script(overloaded(), ...well['price']!);
  const results = await evaluate(inCases('own-order', 'price'), { client: client!, runAs });
  assert.equal(results[0]!.passed, false);
  assert.match(results[0]!.failures[0]!, /^error: 529/);
  assert.equal(results[1]!.passed, true);
});

test('the table: one row per case, why the failing one fails, and the total', () => {
  const output = table([
    { id: 'own-order', judge: false, passed: true, failures: [], tokens: 300, costUsd: 0.000054 },
    {
      id: 'coffee-gift',
      judge: true,
      passed: false,
      failures: ["judge: …: it doesn't give the price"],
      tokens: 450,
      costUsd: 0.000081,
    },
  ]);
  const lines = output.split('\n');
  assert.match(lines[0]!, /^case\s+how\s+passes\s+tokens\s+cost \(\$\)$/);
  assert.match(lines[1]!, /^own-order\s+code\s+yes\s+300\s+0\.000054$/);
  assert.match(lines[2]!, /^coffee-gift\s+judge\s+NO\s+450\s+0\.000081$/);
  assert.equal(lines[3], "    - judge: …: it doesn't give the price");
  assert.equal(lines.at(-1), '1 of 2 pass. In total: 750 tokens, $0.000135 (claude-haiku-5-5).');
});

test("npm run evals without ANTHROPIC_API_KEY doesn't start, and says why", async () => {
  const env = { ...process.env, ANTHROPIC_API_KEY: '' };
  const result = await promisify(execFile)('node', ['evals/run.ts'], { env }).catch(
    (error) => error,
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /put your ANTHROPIC_API_KEY in \.env/);
  assert.equal(model.requests.length, 0);
});
