// The shop's help and RAG (Phase 11, lesson 6): migration 015, the chunks of the pages in help/
// (npm run help), the search by meaning and by words, the search_help tool in the assistant (with its
// search_result blocks and the answer's sources) and in MCP. Always with the fake embedder
// (fake-embedder.ts), which brings texts that share words closer, and with the fake model
// (fake-model.ts).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { serve, type ServerType } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  CHUNKS,
  DESCRIPTION_BY_MEANING,
  lookUpHelp,
  MAX_TEXT,
  NO_RESULTS,
  searchHelpByMeaning,
  searchHelpByWords,
} from '../src/assistant/tools/search-help.ts';
import { originOf, type Source } from '../src/assistant/tools/tool.ts';
import { config } from '../src/config.ts';
import { pool } from '../src/db.ts';
import { useEmbedder } from '../src/embeddings.ts';
import { chunkText, loadHelp, loadHelpIfMissing, readHelp, splitPage } from '../src/help.ts';
import { run, useDb } from './db.ts';
import { createFakeEmbedder, fakeVector } from './fake-embedder.ts';
import {
  asksForTools,
  citedBlock,
  message,
  refusal,
  startFakeModel,
  text,
  textBlock,
  toolUseBlock,
} from './fake-model.ts';
import { asKey, asUser, CARMEN } from './identities.ts';

// The fake model, before importing the shop (the SDK reads ANTHROPIC_BASE_URL when it creates the
// client).
const model = await startFakeModel();
process.env.ANTHROPIC_BASE_URL = model.url;
after(() => model.close());
beforeEach(() => model.reset());
const { app } = await import('../src/app.ts');
const { matchesContract } = await import('./contract.ts');

// The fake embedder, new in every test: that way each one knows what it was asked.
let embedder: ReturnType<typeof createFakeEmbedder>;
beforeEach(() => {
  embedder = createFakeEmbedder();
  useEmbedder(embedder);
});

let carmen: Record<string, string>;
let catalogue: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
  catalogue = await asKey('catalogue');
});

// Every test starts with semantic search on (test/.env) and the help loaded with its vectors, even
// if the one before changed it.
beforeEach(async () => {
  config.SEMANTIC_SEARCH = 'yes';
  useEmbedder(createFakeEmbedder());
  await loadHelp();
  useEmbedder(embedder);
});

/** The table's chunks, in order: page, section and whether they have a vector. */
const inTheTable = async () =>
  (
    await pool.query<{ page: string; section: string; with_vector: boolean }>(
      'SELECT page, section, embedding IS NOT NULL AS with_vector FROM help_chunks ORDER BY id',
    )
  ).rows;

// The sections of the four pages in help/, in the order they're loaded (the files, alphabetically;
// the sections, in the page's order).
const SECTIONS = [
  ['account', 'Your account', 'Creating an account'],
  ['account', 'Your account', 'Logging in'],
  ['account', 'Your account', 'What you can do with your account'],
  ['account', 'Your account', 'Your data'],
  ['payments', 'Payments', 'How to pay'],
  ['payments', 'Payments', "When it's confirmed"],
  ['payments', 'Payments', 'If the payment fails'],
  ['payments', 'Payments', 'Invoices'],
  ['returns', 'Cancellations and returns', 'Cancelling an order'],
  ['returns', 'Cancellations and returns', 'Returning a product'],
  ['returns', 'Cancellations and returns', 'When the refund arrives'],
  ['returns', 'Cancellations and returns', "Products that can't be returned"],
  ['shipping', 'Shipping', 'What each order status means'],
  ['shipping', 'Shipping', 'How long it takes'],
  ['shipping', 'Shipping', 'How much it costs'],
  ['shipping', 'Shipping', 'Where is my order'],
];

const RETURNING = {
  page: 'returns',
  title: 'Cancellations and returns',
  section: 'Returning a product',
};

/** The cosine distance between two vectors of length 1, computed in JavaScript. */
const distance = (a: number[], b: number[]) => 1 - a.reduce((sum, x, i) => sum + x * b[i]!, 0);

// #region migration
test('migration 015: help_chunks, with its 384 vector, its generated tsvector and its two indexes', async () => {
  const columns = await pool.query(
    `SELECT column_name, udt_name, is_nullable, is_generated FROM information_schema.columns
     WHERE table_name = 'help_chunks' ORDER BY ordinal_position`,
  );
  assert.deepEqual(
    columns.rows.map((c) => [c.column_name, c.udt_name, c.is_nullable, c.is_generated]),
    [
      ['id', 'int4', 'NO', 'NEVER'],
      ['page', 'text', 'NO', 'NEVER'],
      ['title', 'text', 'NO', 'NEVER'],
      ['section', 'text', 'NO', 'NEVER'],
      ['text', 'text', 'NO', 'NEVER'],
      ['embedding', 'vector', 'YES', 'NEVER'],
      ['search', 'tsvector', 'NO', 'ALWAYS'],
    ],
  );
  const indexes = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'help_chunks' ORDER BY 1`,
  );
  const definition = (name: string) =>
    indexes.rows.find((index) => index.indexname === name)?.indexdef;
  assert.match(
    definition('help_chunks_by_embedding'),
    /USING hnsw \(embedding vector_cosine_ops\)/,
  );
  assert.match(definition('help_chunks_by_words'), /USING gin \(search\)/);
  // PostgreSQL computes the generated column: the words of both titles and of the text, as their
  // stem and without the ones that say nothing ("a").
  const { rows } = await pool.query(
    `SELECT search::text AS search FROM help_chunks WHERE section = 'Returning a product'`,
  );
  assert.match(rows[0].search, /'return':/);
  assert.match(rows[0].search, /'product':/);
  assert.doesNotMatch(rows[0].search, /'a':/);
  // And nobody can write it.
  await assert.rejects(
    pool.query(
      `INSERT INTO help_chunks (page, title, section, text, search)
       VALUES ('a', 'b', 'c', 'd', to_tsvector('d'))`,
    ),
    /cannot insert a non-DEFAULT value into column "search"/,
  );
});
// #endregion migration

// #region split
test("splitPage: one chunk per section, with the page's title; without bold or extra lines", () => {
  const markdown = [
    '# How it works',
    '',
    'What comes before the first section.',
    '',
    '## First part',
    '',
    'A text with **bold**.',
    '',
    '',
    '',
    'And another paragraph.',
    '## Second part',
    '- A list',
    '- of two',
    '## Empty',
    '',
  ].join('\r\n');
  assert.deepEqual(splitPage('how', markdown), [
    {
      page: 'how',
      title: 'How it works',
      section: 'How it works',
      text: 'What comes before the first section.',
    },
    {
      page: 'how',
      title: 'How it works',
      section: 'First part',
      text: 'A text with bold.\n\nAnd another paragraph.',
    },
    { page: 'how', title: 'How it works', section: 'Second part', text: '- A list\n- of two' },
  ]);
  // Without a title, the file's name; a ### doesn't cut.
  assert.deepEqual(splitPage('notes', '## One\nText\n### Inside\nMore'), [
    { page: 'notes', title: 'notes', section: 'One', text: 'Text\n### Inside\nMore' },
  ]);
});
// #endregion split

// #region load
test('npm run help (loadHelp): the four pages, in 16 chunks with their vectors, and the same again', async () => {
  const chunks = await readHelp();
  assert.deepEqual(
    chunks.map(({ page, title, section }) => [page, title, section]),
    SECTIONS,
  );
  assert.ok(chunks.every((chunk) => chunk.text.length > 50 && !chunk.text.includes('**')));

  assert.deepEqual(await loadHelp(), { chunks: 16, withVectors: true });
  // All the texts, in a single call to the model (they fit in a batch of 32), with both titles.
  assert.deepEqual(embedder.requests, [chunks.map(chunkText)]);
  assert.match(embedder.requests[0]![9]!, /^Cancellations and returns: Returning a product\. /);
  const table = await inTheTable();
  assert.deepEqual(
    table.map(({ page, section }) => [page, section]),
    SECTIONS.map(([page, , section]) => [page, section]),
  );
  assert.ok(table.every((row) => row.with_vector));
  const { rows } = await pool.query(
    `SELECT embedding::text AS embedding FROM help_chunks WHERE section = 'Returning a product'`,
  );
  const saved = JSON.parse(rows[0].embedding) as number[];
  const expected = fakeVector(chunkText(chunks[9]!));
  assert.ok(saved.every((x, i) => Math.abs(x - expected[i]!) < 1e-6));

  // Again: the table stays the same, without repeated chunks.
  await loadHelp();
  assert.deepEqual(await inTheTable(), table);
});

test('with SEMANTIC_SEARCH=no, npm run help saves the chunks without a vector, without the model', async () => {
  config.SEMANTIC_SEARCH = 'no';
  assert.deepEqual(await loadHelp(), { chunks: 16, withVectors: false });
  assert.deepEqual(embedder.requests, []);
  assert.ok((await inTheTable()).every((row) => !row.with_vector));

  // The real script, in another process (without the model: with the search off it doesn't load it).
  await pool.query('DELETE FROM help_chunks');
  const { stdout } = await run('node', ['scripts/help.ts'], {
    env: { ...process.env, SEMANTIC_SEARCH: 'no' },
  });
  assert.match(stdout, /^Help loaded: 16 chunks, without vectors, in [\d.]+ s$/m);
  assert.match(stdout, /searches by words/);
  assert.equal((await inTheTable()).length, 16);
});

test("a folder without pages doesn't wipe the help that's there", async () => {
  const empty = await mkdtemp(join(tmpdir(), 'help-'));
  try {
    await assert.rejects(loadHelp(empty), /There are no help pages in/);
    assert.equal((await inTheTable()).length, 16);
  } finally {
    await rm(empty, { recursive: true });
  }
});

test('the worker when it starts (loadHelpIfMissing): loads the help if the table is empty; if not, nothing', async () => {
  assert.equal(await loadHelpIfMissing(), undefined);
  assert.deepEqual(embedder.requests, []);
  await pool.query('DELETE FROM help_chunks');
  assert.deepEqual(await loadHelpIfMissing(), { chunks: 16, withVectors: true });
  assert.equal((await inTheTable()).length, 16);
});

const redis = process.env.REDIS_URL_TESTS;
test(
  'the real worker (scripts/worker.ts) loads the help when it starts with the table empty',
  { skip: redis ? false : 'no Redis: set REDIS_URL_TESTS in test/.env to try it' },
  async () => {
    await pool.query('DELETE FROM help_chunks');
    // With semantic search off: that way it doesn't load the real model, which the tests never
    // download.
    const worker = spawn('node', ['scripts/worker.ts'], {
      env: { ...process.env, REDIS_URL: redis, LOG_LEVEL: 'info', SEMANTIC_SEARCH: 'no' },
    });
    let output = '';
    worker.stdout.on('data', (chunk) => (output += chunk));
    try {
      for (let i = 0; i < 100 && !output.includes("has loaded the shop's help"); i++) {
        await new Promise((ready) => setTimeout(ready, 100));
      }
      assert.match(output, /"chunks":16,"withVectors":false.*has loaded the shop's help/);
      assert.equal((await inTheTable()).length, 16);
    } finally {
      worker.kill('SIGTERM');
      await once(worker, 'exit');
    }
  },
);
// #endregion load

// #region search
test('by meaning: the 3 nearest chunks, with their distance; returning a product, the returns section', async () => {
  const question = 'How do I return a product?';
  const found = await searchHelpByMeaning(question);
  // The API only computes the question's vector.
  assert.deepEqual(embedder.requests, [[question]]);
  assert.equal(found.length, CHUNKS);
  const { distance: first, text: firstText, ...source } = found[0]!;
  assert.deepEqual(source, RETURNING);
  assert.match(firstText, /^You have 30 days from when you receive your order/);
  // The same distances the sum in JavaScript gives, and in order: the 3 smallest.
  const all = (await readHelp())
    .map(
      (chunk) =>
        Math.round(distance(fakeVector(question), fakeVector(chunkText(chunk))) * 1000) / 1000,
    )
    .toSorted((a, b) => a - b);
  assert.deepEqual(
    found.map((chunk) => chunk.distance),
    all.slice(0, CHUNKS),
  );
  assert.equal(first, all[0]);
  assert.deepEqual(Object.keys(found[0]!), ['page', 'title', 'section', 'text', 'distance']);
});

test('by words (SEMANTIC_SEARCH=no): websearch_to_tsquery and ts_rank, without the model; without the words, nothing', async () => {
  config.SEMANTIC_SEARCH = 'no';
  const found = await lookUpHelp('return product');
  assert.ok(found.length >= 1 && found.length <= CHUNKS);
  const { text: _text, ...first } = found[0]!;
  assert.deepEqual(first, { ...RETURNING, distance: null });
  // Every word has to be there: no section talks about mugs.
  assert.deepEqual(await lookUpHelp('can I return a mug?'), []);
  // With or, one is enough.
  assert.ok((await lookUpHelp('mug or refund')).length > 0);
  // A question with only words that say nothing finds nothing (and doesn't fail).
  assert.deepEqual(await lookUpHelp('and so?'), []);
  assert.deepEqual(embedder.requests, []);
});

test('with semantic search on but the help loaded without vectors, it searches by words', async () => {
  config.SEMANTIC_SEARCH = 'no';
  await loadHelp();
  config.SEMANTIC_SEARCH = 'yes';
  const found = await lookUpHelp('return product');
  assert.deepEqual(found, await searchHelpByWords('return product'));
  assert.equal(found[0]!.section, 'Returning a product');
});

test("a very long chunk's text arrives cut, with … at the end", async () => {
  const long = 'To return a product, '.repeat(100);
  await pool.query(
    `INSERT INTO help_chunks (page, title, section, text) VALUES ('long', 'Long', 'Long', $1)`,
    [long],
  );
  config.SEMANTIC_SEARCH = 'no';
  const found = (await lookUpHelp('return product')).find((chunk) => chunk.page === 'long')!;
  assert.equal(found.text.length, MAX_TEXT + 1);
  assert.equal(found.text, `${long.slice(0, MAX_TEXT)}…`);
});
// #endregion search

// #region assistant
const ask = (question: string, accept = 'application/json') =>
  app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...carmen },
    body: JSON.stringify({ messages: [{ role: 'user', text: question }] }),
  });

/** The tool results the shop sent in request i (its last message). */
const resultsOf = (i: number) => model.requests[i]!.body.messages.at(-1).content;

// What the search finds for a question, as sources (without the text or the distance).
const sourcesOf = async (question: string) =>
  (await lookUpHelp(question)).map(({ page, title, section }) => ({ page, title, section }));

/** A text block that cites that section: the request's result number index. */
const citing = (text: string, source: Source, index = 0) =>
  citedBlock(text, { index, ...originOf(source), text: '…' });

test('the assistant searches the help: the chunks go to the model as search_result, and the sources are the sections it cites', async () => {
  const question = 'How do I return a product?';
  model.script(
    asksForTools(toolUseBlock('search_help', { question }, 'toolu_1')),
    // The model answers citing the first result (what the API does with citations on).
    message([
      textBlock("According to the shop's help (Cancellations and returns), "),
      citedBlock('you have 30 days from when you receive it.', {
        index: 0,
        source: 'help/returns.md',
        title: 'Cancellations and returns: Returning a product',
        text: 'You have 30 days…',
      }),
    ]),
  );
  const res = await ask('How do I return a product?');
  assert.equal(res.status, 200);
  const answer = await res.clone().json();
  // The text, with the blocks joined (the citations don't change the text).
  assert.equal(
    answer.text,
    "According to the shop's help (Cancellations and returns), you have 30 days from when you receive it.",
  );
  // The sources: the section the answer cites, and not the three the tool returned.
  assert.equal((await sourcesOf(question)).length, CHUNKS);
  assert.deepEqual(answer.sources, [RETURNING]);
  await matchesContract(res, 'post', '/assistant');

  // The definition the model saw: the one for the search by meaning.
  const definition = model.requests[0]!.body.tools.find(
    (tool: { name: string }) => tool.name === 'search_help',
  );
  assert.equal(definition.description, DESCRIPTION_BY_MEANING);
  assert.equal(definition.strict, true);
  // What it got in the second round: a tool_result with three search_result blocks, citations on.
  const [result] = resultsOf(1);
  assert.equal(result.tool_use_id, 'toolu_1');
  assert.equal(result.content.length, CHUNKS);
  assert.deepEqual(result.content[0], {
    type: 'search_result',
    source: 'help/returns.md',
    title: 'Cancellations and returns: Returning a product',
    content: [{ type: 'text', text: (await lookUpHelp(question))[0]!.text }],
    citations: { enabled: true },
  });
});

test('two searches in one answer: the sources, the ones it cites, without repeats and in the order it cites them', async () => {
  const first = 'How do I return a product?';
  const second = 'When does the refund for a product arrive?';
  const refund = (await sourcesOf(second)).find((s) => s.section === 'When the refund arrives');
  assert.ok(refund, 'the second search finds the refund section');
  // A citation of something the shop didn't give the model: it doesn't count.
  const madeUp = { page: 'shop', title: 'The physical shop', section: 'Where we are' };
  model.script(
    asksForTools(toolUseBlock('search_help', { question: first }, 'toolu_1')),
    asksForTools(toolUseBlock('search_help', { question: second }, 'toolu_2')),
    message([
      citing('You have 30 days', RETURNING),
      textBlock(', '),
      citing('and the refund takes 5 to 10 business days', refund, 3),
      textBlock(' '),
      citing('(from when you receive it).', RETURNING),
      citing(' And you can come and see us.', madeUp, 4),
    ]),
  );
  const res = await ask('Can I return something and when do I get my money back?');
  const { sources } = await res.json();
  assert.deepEqual(sources, [RETURNING, refund]);
});

test('an "I don\'t know" that cites nothing has no sources, even if the model read three sections', async () => {
  const question = 'Do you have a physical shop where I can go and see the products?';
  model.script(
    asksForTools(toolUseBlock('search_help', { question }, 'toolu_1')),
    text("The shop's help doesn't say anything about that: email support@shop.example."),
  );
  const answer = await (await ask(question)).json();
  // By meaning, the search always finds three sections, and the model has read them.
  const [result] = resultsOf(1);
  assert.equal(result.content.length, CHUNKS);
  // But the answer comes from none of them, and cites none.
  assert.deepEqual(answer.sources, []);
});

test('streamed: the tool event says "Searching the help…", and end carries the sources it cites', async () => {
  const question = 'How do I return a product?';
  model.script(
    asksForTools(toolUseBlock('search_help', { question }, 'toolu_1')),
    message([
      textBlock('Yes, '),
      citedBlock('within 30 days.', {
        index: 0,
        source: 'help/returns.md',
        title: 'Cancellations and returns: Returning a product',
        text: 'You have 30 days…',
      }),
    ]),
  );
  const res = await ask(question, 'text/event-stream');
  assert.match(res.headers.get('content-type')!, /^text\/event-stream/);
  const events = (await res.text())
    .split('\n\n')
    .filter((chunk) => chunk !== '')
    .map((chunk) => ({
      event: chunk.match(/^event: (.*)$/m)![1]!,
      data: JSON.parse(chunk.match(/^data: (.*)$/m)![1]!),
    }));
  assert.deepEqual(events[0], {
    event: 'tool',
    data: { name: 'search_help', label: 'Searching the help…' },
  });
  const pieces = events.filter(({ event }) => event === 'text').map(({ data }) => data.text);
  assert.equal(pieces.join(''), 'Yes, within 30 days.');
  const end = events.at(-1)!;
  assert.equal(end.event, 'end');
  assert.equal(end.data.text, 'Yes, within 30 days.');
  // The citations arrive in the stream (citations_delta), and the SDK joins them in their block:
  // the one it cites.
  assert.deepEqual(end.data.sources, [RETURNING]);
  // end's data is an AssistantAnswer: the same shape as the 200 in JSON.
  await matchesContract(Response.json(end.data), 'post', '/assistant');
});

test('with nothing to find (by words), the model gets the sentence that says so, and there are no sources', async () => {
  config.SEMANTIC_SEARCH = 'no';
  model.script(
    asksForTools(toolUseBlock('search_help', { question: 'physical shop' })),
    text("The shop's help doesn't say anything about that: email support@shop.example."),
  );
  const res = await ask('Do you have a physical shop?');
  assert.deepEqual((await res.json()).sources, []);
  const [result] = resultsOf(1);
  assert.equal(result.content, NO_RESULTS);
  assert.equal(result.is_error, undefined);
});

test('if the model refuses after searching, neither its text nor sources', async () => {
  model.script(
    asksForTools(toolUseBlock('search_help', { question: 'How do I return a product?' })),
    refusal('cyber'),
  );
  const answer = await (await ask('How do I return a product?')).json();
  assert.equal(answer.refused, true);
  assert.deepEqual(answer.sources, []);
});

test("an empty question doesn't get to search: is_error with the reason, so the model can fix it", async () => {
  model.script(
    asksForTools(toolUseBlock('search_help', { question: '   ' })),
    text('What would you like to know?'),
  );
  const answer = await (await ask('Help')).json();
  assert.deepEqual(answer.sources, []);
  const [result] = resultsOf(1);
  assert.equal(result.is_error, true);
  assert.match(result.content, /question: Can't be empty/);
  assert.deepEqual(embedder.requests, []);
});
// #endregion assistant

// #region mcp
test('MCP: search_help, for any key, with the same function; the chunks in JSON', async () => {
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
    const help = tools.find((tool) => tool.name === 'search_help')!;
    assert.equal(help.description, DESCRIPTION_BY_MEANING);
    assert.deepEqual(help.inputSchema.required, ['question']);
    assert.equal(help.annotations?.readOnlyHint, true);
    const question = 'How do I return a product?';
    const result = (await mcp.callTool({
      name: 'search_help',
      arguments: { question },
    })) as CallToolResult;
    assert.notEqual(result.isError, true);
    const found = JSON.parse((result.content[0] as { text: string }).text);
    assert.deepEqual(found, await lookUpHelp(question));
    assert.equal(found[0].section, 'Returning a product');
  } finally {
    await mcp.close();
    await new Promise((closed) => server!.close(closed));
  }
});
// #endregion mcp
