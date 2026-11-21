// The streaming assistant (Phase 11, lesson 2): POST /v2/assistant with Accept: text/event-stream,
// against the fake model (fake-model.ts). As in assistant.test.ts, the fake model is started first
// and the shop is imported afterwards: the SDK reads ANTHROPIC_BASE_URL when it creates the client.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { REFUSAL_TEXT } from '../src/assistant/conversation.ts';
import { DEFAULT_WAIT, modelFailure, notAvailable } from '../src/assistant/errors.ts';
import { asSSE, shopEvent } from '../src/assistant/events.ts';
import { definitions } from '../src/assistant/tools/index.ts';
import { useDb } from './db.ts';
import { CARMEN, asUser } from './identities.ts';
import {
  apiError,
  errorMidStream,
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
const { log } = await import('../src/log.ts');
const { matchesContract } = await import('./contract.ts');
const { createMemoryStore, store } = await import('../src/rate-limits.ts');

// Every test starts with no questions recorded in the limits (rate-limits.ts), as in
// assistant.test.ts.
beforeEach(() => Object.assign(store, createMemoryStore()));

let carmen: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
});

const hello = { messages: [{ role: 'user', text: 'Hi, can you help me with an order?' }] };

// The question, asking for the answer streamed (or with whatever Accept it's given).
const ask = (
  body: unknown = hello,
  accept = 'text/event-stream',
  headers: Record<string, string> = carmen,
) =>
  app.request('/v2/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...headers },
    body: JSON.stringify(body),
  });

type Event = { event: string; data: any };

// A whole stream, read until it closes: its events, in order, with the data already parsed.
function readEvents(raw: string): Event[] {
  return raw
    .split('\n\n')
    .filter((chunk) => chunk !== '')
    .map((chunk) => ({
      event: chunk.match(/^event: (.*)$/m)![1]!,
      data: JSON.parse(chunk.match(/^data: (.*)$/m)![1]!),
    }));
}

type Reader = ReadableStreamDefaultReader<string>;

// The next event of a stream that hasn't finished yet (as in realtime.test.ts).
async function nextEvent(reader: Reader): Promise<Event> {
  let read = '';
  while (!read.includes('\n\n')) {
    const { value, done } = await reader.read();
    if (done) throw new Error('The stream has closed');
    read += value;
  }
  return readEvents(read)[0]!;
}

// What a test looks at in the log: the calls with that message (the request logger also writes an
// info line for every request).
const withMessage = (spy: ReturnType<typeof mock.method>, message: string) =>
  spy.mock.calls.filter((call) => call.arguments[1] === message);

// Waits until something that happens elsewhere (the fake model, the log) is true, a second at most.
async function until(condition: () => boolean) {
  for (let ms = 0; !condition(); ms += 10) {
    if (ms >= 1000) throw new Error("It didn't happen within a second");
    await sleep(10);
  }
}

// #region pure
// A model event, as the SDK gives it, with what shopEvent needs.
const fromModel = (event: object) => event as Anthropic.MessageStreamEvent;

test("shopEvent: a piece of the model's text is a text event of the shop's", () => {
  const piece = fromModel({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Hi! ' },
  });
  assert.deepEqual(shopEvent(piece), { event: 'text', data: { text: 'Hi! ' } });
});

test("shopEvent: the model's other events stay in the shop (undefined)", () => {
  const others = [
    { type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 9 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    // What the model thinks before answering, and its signature: not for the customer.
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 's' } },
    // What it passes to a tool (lesson 3), in pieces.
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{' },
    },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  for (const event of others) assert.equal(shopEvent(fromModel(event)), undefined);
});

test("asSSE: the event's name and its data in JSON, on a single line even if the text has several", () => {
  assert.deepEqual(asSSE({ event: 'text', data: { text: 'Hi,\nCarmen' } }), {
    event: 'text',
    data: '{"text":"Hi,\\nCarmen"}',
  });
  const end = { text: 'Hi', refused: false, usage: { input: 10, output: 2 }, sources: [] };
  assert.deepEqual(asSSE({ event: 'end', data: end }), { event: 'end', data: JSON.stringify(end) });
});

test('modelFailure: an error event mid-stream (no status code) is read by its type', () => {
  // As the SDK throws them when it reads an error event: status undefined and, in type, the error's
  // type.
  const midStream = (errorType: string) =>
    new Anthropic.APIError(
      undefined,
      { type: 'error', error: { type: errorType, message: '…' } },
      undefined,
      new Headers(),
    );
  assert.deepEqual(modelFailure(midStream('overloaded_error')), {
    status: 503,
    retryAfter: DEFAULT_WAIT,
    detail: 'The model is overloaded',
  });
  assert.deepEqual(modelFailure(midStream('api_error')), {
    status: 503,
    retryAfter: DEFAULT_WAIT,
    detail: 'The model is overloaded',
  });
  assert.match(
    (modelFailure(midStream('rate_limit_error')) as { detail: string }).detail,
    /too many requests/,
  );
  // Any other type is the shop's failure, like a 400.
  assert.deepEqual(modelFailure(midStream('invalid_request_error')), { status: 500 });
});

test('modelFailure: a network cut mid-stream (AnthropicError with a cause) is passing', () => {
  // As the SDK throws it: the network error (undici says "terminated") inside, in cause.
  const cut = new Anthropic.AnthropicError('terminated', { cause: new TypeError('terminated') });
  assert.deepEqual(modelFailure(cut), {
    status: 503,
    retryAfter: DEFAULT_WAIT,
    detail: 'The model is not answering',
  });
  // An AnthropicError with no cause, nobody knows what it is: it goes on its way, as the shop's
  // failure.
  assert.equal(modelFailure(new Anthropic.AnthropicError('something else')), undefined);
});

test('notAvailable: the problem of a passing failure, the same with and without streaming', () => {
  assert.deepEqual(
    notAvailable({ status: 503, retryAfter: 17, detail: 'The model is not answering' }),
    {
      type: 'https://shop.example/problems/assistant-not-available',
      title: 'The assistant is not available right now',
      status: 503,
      detail: 'The model is not answering: try again in 17 seconds',
    },
  );
});
// #endregion pure

// #region stream
test('with Accept: text/event-stream, text events in order and an end with the whole answer and the tokens', async () => {
  const reply = 'Sure, Carmen. We have mugs, T-shirts, hoodies and caps: what are you looking for?';
  model.script(text(reply, { usage: { input: 412, output: 38 } }));
  const res = await ask();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const events = readEvents(await res.text());

  // First, the pieces of text (more than one), and last, end. Nothing else: no model event.
  const names = events.map(({ event }) => event);
  assert.equal(names.at(-1), 'end');
  assert.ok(names.slice(0, -1).every((name) => name === 'text'));
  assert.ok(names.length > 2);
  // The pieces, together, are the answer; and end carries it whole, with the tokens.
  const pieces = events.slice(0, -1).map(({ data }) => data.text);
  assert.equal(pieces.join(''), reply);
  const end = events.at(-1)!.data;
  assert.deepEqual(end, {
    text: reply,
    refused: false,
    usage: { input: 412, output: 38 },
    sources: [],
  });
  // end's data is an AssistantAnswer: the same shape as the 200 in JSON, in the contract.
  await matchesContract(Response.json(end), 'post', '/assistant');
});

test('the streamed request: the same as without it (model, instructions, effort, limit, tools), with stream: true', async () => {
  model.script(text('Yes, you can return it.'));
  await (await ask({ messages: [{ role: 'user', text: 'Can I return a mug?' }] })).text();
  assert.equal(model.requests.length, 1);
  assert.deepEqual(model.requests[0]!.body, {
    model: 'claude-haiku-5-5',
    max_tokens: 2048,
    system: await readFile('src/assistant/instructions.md', 'utf8'),
    output_config: { effort: 'low' },
    tools: definitions,
    messages: [{ role: 'user', content: 'Can I return a mug?' }],
    stream: true,
  });
});

test('without asking for the stream (application/json, */* like curl), the whole answer in JSON, as in lesson 1', async () => {
  for (const accept of ['application/json', '*/*', 'text/event-stream;q=0, application/json']) {
    model.script(text('Hi, Carmen!', { usage: { input: 300, output: 6 } }));
    const res = await ask(hello, accept);
    assert.equal(res.status, 200, accept);
    assert.match(res.headers.get('content-type')!, /^application\/json/);
    assert.deepEqual(await res.clone().json(), {
      text: 'Hi, Carmen!',
      refused: false,
      usage: { input: 300, output: 6 },
      sources: [],
    });
    await matchesContract(res, 'post', '/assistant');
    // No stream in the request to the model.
    assert.ok(!('stream' in model.requests.at(-1)!.body));
  }
});

test('the customer leaves halfway: the shop cancels the call, the fake model sees the connection cut, and one log line', async () => {
  const info = mock.method(log, 'info', () => {});
  try {
    const long =
      'Let me tell you everything we have for the cold, garment by garment, leaving nothing out.';
    model.script(text(long, { pause: 30 }));
    const res = await ask();
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const first = await nextEvent(reader);
    assert.equal(first.event, 'text');
    // The customer closes the tab.
    await reader.cancel();
    // The cancellation reaches the call to the model: the fake model doesn't get to send it all.
    assert.equal(await model.requests[0]!.finished, 'cut');
    const lines = withMessage(info, 'the customer left: cancelling the call to the model');
    assert.equal(lines.length, 1);
    assert.ok((lines[0]!.arguments[0] as { requestId: string }).requestId);
  } finally {
    info.mock.restore();
  }
});

// With the shop really listening, on a free port, as in assistant.test.ts: before the first event
// the shop hasn't started the stream yet, and whoever sees the customer leave is @hono/node-server.
test('the customer leaves before the first event: the shop cancels the call to the model at once', async () => {
  const info = mock.method(log, 'info', () => {});
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    model.script(silence());
    const leave = new AbortController();
    const request = fetch(`http://127.0.0.1:${port}/v2/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...carmen },
      body: JSON.stringify(hello),
      signal: leave.signal,
    });
    await until(() => model.requests.length === 1);
    const before = performance.now();
    leave.abort();
    await assert.rejects(request, { name: 'AbortError' });
    // Long before the tests' 2 s of MODEL_TIMEOUT_MS.
    assert.equal(await model.requests[0]!.finished, 'cut');
    assert.ok(performance.now() - before < 1000, `${performance.now() - before} ms`);
    const message = 'the customer left: cancelling the call to the model';
    await until(() => withMessage(info, message).length === 1);
  } finally {
    info.mock.restore();
    server.close();
  }
});

test("the assistant's time limit (3 s in the tests) runs out halfway: an error event with the 503, not a customer leaving", async () => {
  const warn = mock.method(log, 'warn', () => {});
  const info = mock.method(log, 'info', () => {});
  try {
    // About 30 pieces, one every 150 ms: more than 4 seconds.
    model.script(text('Let me tell you slowly, word by word. '.repeat(7), { pause: 150 }));
    const res = await ask();
    assert.equal(res.status, 200);
    const events = readEvents(await res.text());
    const names = events.map(({ event }) => event);
    assert.ok(names.filter((name) => name === 'text').length > 3);
    assert.equal(names.at(-1), 'error');
    assert.ok(!names.includes('end'));
    assert.equal(events.at(-1)!.data.status, 503);
    assert.match(events.at(-1)!.data.detail, /not answering/);
    // The call to the model was cancelled, as when the customer leaves; but the customer is still
    // there, and what the log says is that the model isn't available.
    assert.equal(await model.requests[0]!.finished, 'cut');
    assert.equal(
      withMessage(info, 'the customer left: cancelling the call to the model').length,
      0,
    );
    assert.equal(withMessage(warn, 'the model is not available').length, 1);
  } finally {
    warn.mock.restore();
    info.mock.restore();
  }
});

test('the model refuses while streaming: end with refused and the fixed sentence, and a warning in the log', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(refusal('cyber'));
    const events = readEvents(await (await ask()).text());
    const end = events.at(-1)!;
    assert.equal(end.event, 'end');
    assert.equal(end.data.refused, true);
    assert.equal(end.data.text, REFUSAL_TEXT);
    const warnings = withMessage(warning, 'the model refused to answer');
    assert.equal(warnings.length, 1);
    assert.equal((warnings[0]!.arguments[0] as { category: string }).category, 'cyber');
  } finally {
    warning.mock.restore();
  }
});
// #endregion stream

// #region errors
test('a 429 before starting: a normal 503, in JSON and with Retry-After, not a stream', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(rateLimited(17));
    const res = await ask();
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '17');
    assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
    const problem = await res.clone().json();
    assert.equal(problem.type, 'https://shop.example/problems/assistant-not-available');
    assert.match(problem.detail, /too many requests.*17 seconds/);
    await matchesContract(res, 'post', '/assistant');
    assert.equal(withMessage(warning, 'the model is not available').length, 1);
  } finally {
    warning.mock.restore();
  }
});

test('the API rejects the request before starting (400): the usual 500, in the log', async () => {
  const errors = mock.method(log, 'error', () => {});
  try {
    model.script(apiError(400, 'invalid_request_error', 'max_tokens: too large'));
    const res = await ask();
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
    assert.doesNotMatch(await res.text(), /max_tokens/);
    assert.equal(withMessage(errors, "the model's API rejected the shop's request").length, 1);
  } finally {
    errors.mock.restore();
  }
});

test('an error halfway (the API gets overloaded): the text that already arrived, an error event with the problem and the stream closed', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(errorMidStream('Sure, here is what we have'));
    const res = await ask();
    // The response had already started: its status is 200, and the error arrives as an event.
    assert.equal(res.status, 200);
    const events = readEvents(await res.text());
    const names = events.map(({ event }) => event);
    assert.equal(names.at(-1), 'error');
    assert.ok(!names.includes('end'));
    assert.equal(
      events
        .filter(({ event }) => event === 'text')
        .map(({ data }) => data.text)
        .join(''),
      'Sure, here is what we have',
    );
    const problem = events.at(-1)!.data;
    assert.deepEqual(problem, {
      type: 'https://shop.example/problems/assistant-not-available',
      title: 'The assistant is not available right now',
      status: 503,
      detail: `The model is overloaded: try again in ${DEFAULT_WAIT} seconds`,
    });
    // The error event's data is a Problem from the contract, like the 503's body.
    await matchesContract(
      Response.json(problem, {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      }),
      'post',
      '/assistant',
    );
    assert.equal(withMessage(warning, 'the model is not available').length, 1);
  } finally {
    warning.mock.restore();
  }
});

test('the connection to the model is cut halfway: an error event with the "not answering" 503', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    model.script(errorMidStream('Sure, here is', 'cut'));
    const events = readEvents(await (await ask()).text());
    assert.deepEqual(
      events.map(({ event }) => event),
      [...events.slice(0, -1).map(() => 'text'), 'error'],
    );
    assert.equal(events.at(-1)!.data.status, 503);
    assert.match(events.at(-1)!.data.detail, /not answering/);
    assert.equal(withMessage(warning, 'the model is not available').length, 1);
  } finally {
    warning.mock.restore();
  }
});

test('with Accept: text/event-stream, what fails before asking the model is the usual error response', async () => {
  // A conversation that isn't valid: 422, without asking the model.
  const notValid = await ask({ messages: [] });
  assert.equal(notValid.status, 422);
  await matchesContract(notValid, 'post', '/assistant');
  // Without a session: 401.
  const noSession = await ask(hello, 'text/event-stream', {});
  assert.equal(noSession.status, 401);
  await matchesContract(noSession, 'post', '/assistant');
  assert.equal(model.requests.length, 0);
});
// #endregion errors
