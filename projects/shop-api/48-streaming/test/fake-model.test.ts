// The fake model's tests (fake-model.ts): that it speaks like the real API, checked with the SDK
// itself. If the fake model changed the way it answers, or the SDK the way it reads, these tests
// would fail before the shop's, and would say where the difference is.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { after, beforeEach, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import {
  errorMidStream,
  message,
  overloaded,
  rateLimited,
  refusal,
  startFakeModel,
  text,
  textBlock,
  thinking,
  toolUseBlock,
} from './fake-model.ts';

const model = await startFakeModel();
after(() => model.close());
beforeEach(() => model.reset());

// An SDK client like the shop's, pointing at the fake model and without retries.
const client = new Anthropic({ apiKey: 'test-key', baseURL: model.url, maxRetries: 0 });
const question = {
  model: 'claude-haiku-5-5',
  max_tokens: 100,
  messages: [{ role: 'user' as const, content: 'Where is my order?' }],
};

// The content as it's compared: without the internal properties the SDK adds when reading.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

// Asks for the stream with fetch, without the SDK, and returns it as a list of events: their name
// (event:) and their data (data:, already parsed).
async function rawStream() {
  const res = await fetch(`${model.url}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...question, stream: true }),
  });
  assert.match(res.headers.get('content-type')!, /^text\/event-stream/);
  return (await res.text())
    .split('\n\n')
    .filter((chunk) => chunk !== '')
    .map((chunk) => {
      const [event, data] = chunk.split('\n');
      return {
        event: event!.replace('event: ', ''),
        data: JSON.parse(data!.replace('data: ', '')),
      };
    });
}

test('without stream: messages.create gets the message as JSON, with stop_reason and usage', async () => {
  model.script(text('Hi!', { usage: { input: 25, output: 4 } }));
  const answer = await client.messages.create(question);
  // First, what it thought: a thinking block with empty text and its signature, like Claude Haiku
  // 5.5's. Then, the answer.
  assert.deepEqual(plain(answer.content), [
    { type: 'thinking', thinking: '', signature: 'fake-signature-1' },
    { type: 'text', text: 'Hi!' },
  ]);
  assert.equal(answer.stop_reason, 'end_turn');
  assert.equal(answer.model, 'claude-haiku-5-5');
  assert.equal(answer.usage.input_tokens, 25);
  assert.equal(answer.usage.output_tokens, 4);
});

test("the SDK reads the fake model's stream: finalMessage() gives the whole message, text and tool", async () => {
  const content = [
    textBlock("I'll look at your order now, one moment."),
    toolUseBlock('view_order', { id: 21 }, 'toolu_1'),
  ];
  model.script(message(content, { stopReason: 'tool_use', usage: { input: 50, output: 20 } }));
  const stream = client.messages.stream(question);
  const textPieces: string[] = [];
  stream.on('text', (piece) => textPieces.push(piece));
  const final = await stream.finalMessage();
  // The SDK has put the pieces together: the thinking's signature too, which comes in its
  // signature_delta.
  assert.deepEqual(plain(final.content), [thinking(1), ...content]);
  assert.equal(final.stop_reason, 'tool_use');
  assert.equal(final.usage.input_tokens, 50);
  assert.equal(final.usage.output_tokens, 20);
  // The text arrives in several pieces (text_delta), and together they're the whole text.
  assert.ok(textPieces.length > 1);
  assert.equal(textPieces.join(''), "I'll look at your order now, one moment.");
  // The SDK asked for the stream.
  assert.equal(model.requests[0]!.body.stream, true);
});

test('the raw stream: the events in the API order, each with its event: and its data:', async () => {
  model.script(message([textBlock('Hi'), toolUseBlock('search', { query: 'mug' })]));
  const events = await rawStream();
  // Each data carries its type, the same as the event's name.
  for (const { event, data } of events) assert.equal(data.type, event);
  const ofBlock = (index: number) =>
    events.filter(({ data }) => data.index === index).map(({ event }) => event);
  assert.deepEqual(
    events.map(({ event }) => event).filter((event) => !event.startsWith('content_block')),
    ['message_start', 'ping', 'message_delta', 'message_stop'],
  );
  // Three blocks: the thinking, the text and the tool.
  for (const index of [0, 1, 2]) {
    const ofThis = ofBlock(index);
    assert.equal(ofThis[0], 'content_block_start');
    assert.equal(ofThis.at(-1), 'content_block_stop');
    assert.ok(ofThis.slice(1, -1).every((event) => event === 'content_block_delta'));
  }
  // The thinking, as the API sends it with display: omitted: it starts empty, an empty
  // thinking_delta arrives and, just before it closes, its signature, in a signature_delta.
  assert.deepEqual(
    events
      .filter(({ data }) => data.index === 0)
      .map(({ data }) => data.content_block ?? data.delta ?? null),
    [
      { type: 'thinking', thinking: '', signature: '' },
      { type: 'thinking_delta', thinking: '' },
      { type: 'signature_delta', signature: 'fake-signature-1' },
      null,
    ],
  );
  const deltas = events.filter(({ event }) => event === 'content_block_delta');
  assert.ok(deltas.some(({ data }) => data.delta.type === 'text_delta'));
  assert.ok(deltas.some(({ data }) => data.delta.type === 'input_json_delta'));
  const final = events.find(({ event }) => event === 'message_delta')!.data;
  assert.equal(final.delta.stop_reason, 'end_turn');
  assert.equal(final.usage.output_tokens, 30);
});

test('a refusal: stop_reason refusal and stop_details with the category, with and without stream', async () => {
  model.script(refusal('cyber'), refusal('cyber'));
  const answer = await client.messages.create(question);
  assert.equal(answer.stop_reason, 'refusal');
  assert.equal(answer.stop_details?.category, 'cyber');
  const final = await client.messages.stream(question).finalMessage();
  assert.equal(final.stop_reason, 'refusal');
  assert.equal(final.stop_details?.category, 'cyber');
});

test('429 with retry-after: the SDK throws RateLimitError, with the header', async () => {
  model.script(rateLimited(17));
  await assert.rejects(client.messages.create(question), (error) => {
    assert.ok(error instanceof Anthropic.RateLimitError);
    assert.equal(error.headers.get('retry-after'), '17');
    assert.equal(error.type, 'rate_limit_error');
    return true;
  });
});

test('529: the SDK throws OverloadedError, also when asking for the stream', async () => {
  model.script(overloaded(), overloaded());
  for (const call of [
    () => client.messages.create(question),
    () => client.messages.stream(question).finalMessage(),
  ]) {
    await assert.rejects(call(), (error) => {
      assert.ok(error instanceof Anthropic.OverloadedError);
      assert.equal(error.status, 529);
      assert.equal(error.type, 'overloaded_error');
      return true;
    });
  }
});

test('with retries, the SDK repeats a 529 on its own, and the second time it answers: the fake model sees both', async () => {
  const withRetries = new Anthropic({ apiKey: 'test-key', baseURL: model.url, maxRetries: 1 });
  model.script(overloaded(), text("I'm here now"));
  const answer = await withRetries.messages.create(question);
  // The second request: its thinking carries signature 2.
  assert.deepEqual(plain(answer.content), [thinking(2), { type: 'text', text: "I'm here now" }]);
  assert.equal(model.requests.length, 2);
});

test('it records each request: the path, the headers (with the key) and the body', async () => {
  model.script(text('OK'));
  await client.messages.create(question);
  const [request] = model.requests;
  assert.equal(request!.path, '/v1/messages');
  // The SDK sends the key in Authorization: Bearer (with curl the x-api-key header works too).
  assert.equal(request!.headers.authorization, 'Bearer test-key');
  assert.ok(request!.headers['anthropic-version']);
  assert.deepEqual(request!.body, question);
});

test('with no turns in the script, a 500 that says so', async () => {
  await assert.rejects(client.messages.create(question), (error) => {
    assert.ok(error instanceof Anthropic.InternalServerError);
    assert.match(error.message, /no more turns/);
    return true;
  });
});

// #region slow-stream
test('with a pause, the stream arrives little by little; if the client cuts it halfway, the fake model sees it', async () => {
  const long = 'A long answer, which the model keeps writing little by little, piece by piece.';
  model.script(text(long, { pause: 20 }), text(long, { pause: 20 }));
  // Whole: it takes at least one pause per event (more than 10 events, more than 200 ms).
  const before = performance.now();
  const final = await client.messages.stream(question).finalMessage();
  assert.ok(performance.now() - before >= 200);
  assert.deepEqual(plain(final.content), [thinking(1), { type: 'text', text: long }]);
  assert.equal(await model.requests[0]!.finished, 'whole');

  // Cut: with the first piece of text, the client cancels with an AbortController (the SDK closes
  // the connection). The fake model doesn't have time to send it all.
  const cancel = new AbortController();
  const stream = client.messages.stream(question, { signal: cancel.signal });
  const received: string[] = [];
  stream.on('text', (piece) => {
    received.push(piece);
    cancel.abort();
  });
  await assert.rejects(stream.finalMessage(), Anthropic.APIUserAbortError);
  assert.equal(await model.requests[1]!.finished, 'cut');
  assert.ok(received.join('').length < long.length);
});
// #endregion slow-stream

// #region error-mid-stream
test('an error mid-stream: the text from the start, and instead of the end, an error event', async () => {
  model.script(errorMidStream('Sure, here is what we have'));
  const events = await rawStream();
  const names = events.map(({ event }) => event);
  assert.deepEqual(names.slice(0, 3), ['message_start', 'ping', 'content_block_start']);
  assert.ok(names.includes('content_block_delta'));
  // Last, the error, with the shape of an API error's body; no message_stop.
  assert.equal(names.at(-1), 'error');
  assert.ok(!names.includes('message_stop'));
  assert.deepEqual(events.at(-1)!.data, {
    type: 'error',
    error: { type: 'overloaded_error', message: 'Overloaded' },
  });
});

test('the SDK reads the mid-stream error: an APIError with no status, with the type; without stream, the 529', async () => {
  model.script(errorMidStream('Sure, here is what we have'), errorMidStream('Sure'));
  const stream = client.messages.stream(question);
  const received: string[] = [];
  stream.on('text', (piece) => received.push(piece));
  await assert.rejects(stream.finalMessage(), (error) => {
    assert.ok(error instanceof Anthropic.APIError);
    // The response was already a 200: the error has no status code, only its type.
    assert.equal(error.status, undefined);
    assert.equal(error.type, 'overloaded_error');
    return true;
  });
  // The text from before the error did arrive.
  assert.equal(received.join(''), 'Sure, here is what we have');
  // Without stream there's no "halfway": the response is the error, with its status code.
  await assert.rejects(client.messages.create(question), Anthropic.OverloadedError);
});

test('a connection cut halfway: the SDK throws an AnthropicError with the network error in cause', async () => {
  model.script(errorMidStream('Sure, here is', 'cut'), errorMidStream('Sure', 'cut'));
  const stream = client.messages.stream(question);
  const received: string[] = [];
  stream.on('text', (piece) => received.push(piece));
  await assert.rejects(stream.finalMessage(), (error) => {
    // It isn't an APIError (the response was already a 200, and there's no error event): it's the
    // cut.
    assert.ok(error instanceof Anthropic.AnthropicError);
    assert.ok(!(error instanceof Anthropic.APIError));
    assert.ok(error.cause instanceof Error);
    return true;
  });
  assert.equal(received.join(''), 'Sure, here is');
  // Without stream, the connection closes before answering: for the SDK, an APIConnectionError.
  await assert.rejects(client.messages.create(question), Anthropic.APIConnectionError);
});
// #endregion error-mid-stream

test('with a pause, the stream arrives little by little, and without stream the whole answer takes the same', async () => {
  const long =
    'A long answer, which the model writes little by little, piece by piece, bit by bit.';
  model.script(text(long, { pause: 20 }), text(long, { pause: 20 }));
  // Streamed, a pause between one event and the next (about 20 events): the first piece of text
  // arrives early, and the rest, little by little.
  const before = performance.now();
  let first = 0;
  const stream = client.messages.stream(question);
  stream.once('text', () => (first = performance.now() - before));
  await stream.finalMessage();
  const total = performance.now() - before;
  assert.ok(total >= 200 && first < total - 100, `first ${first} ms, total ${total} ms`);
  // Without stream, as long as the stream would take, and the answer arrives whole, at once.
  const beforeJson = performance.now();
  const answer = await client.messages.create(question);
  assert.ok(performance.now() - beforeJson >= 200);
  assert.deepEqual(plain(answer.content), [thinking(2), { type: 'text', text: long }]);
});

// #region practise
// npm run fake-model (scripts/fake-model.ts): the same fake model, in its own process, to practise
// with. It starts on a free port (PORT=0) with the 429 scenario, and answers every request with
// it, a line for each one; with a scenario that doesn't exist, it says which ones there are.
test('npm run fake-model starts with the scenario it is asked for and always answers with it', async () => {
  const child = spawn(process.execPath, ['scripts/fake-model.ts', '429'], {
    env: { ...process.env, PORT: '0' },
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  try {
    let url: string | undefined;
    for (let ms = 0; url === undefined && ms < 5000; ms += 20) {
      url = /Fake model at (http:\/\/\S+), with the 429 scenario/.exec(output)?.[1];
      if (url === undefined) await sleep(20);
    }
    assert.ok(url, `it didn't say where it listens: ${output}`);
    const practice = new Anthropic({ apiKey: 'any-key', baseURL: url, maxRetries: 0 });
    for (let time = 0; time < 2; time++) {
      await assert.rejects(practice.messages.create(question), (error) => {
        assert.ok(error instanceof Anthropic.RateLimitError);
        assert.equal(error.headers.get('retry-after'), '3');
        return true;
      });
    }
    // Each request's line comes through the process's output, and the answer over HTTP: two paths,
    // and the answer can arrive first. Wait for the second line (2 s at most).
    const lines = () => output.match(/← 429 rate_limit_error, retry-after: 3/g)?.length ?? 0;
    for (let ms = 0; lines() < 2 && ms < 2000; ms += 20) await sleep(20);
    assert.equal(lines(), 2);
  } finally {
    child.kill('SIGTERM');
  }
  // With SIGTERM (Ctrl + C, or docker compose stop), it closes the server and ends cleanly.
  assert.deepEqual(await once(child, 'exit'), [0, null]);

  const other = spawn(process.execPath, ['scripts/fake-model.ts', 'none']);
  let errors = '';
  other.stderr.setEncoding('utf8').on('data', (chunk: string) => (errors += chunk));
  assert.deepEqual(await once(other, 'exit'), [1, null]);
  assert.match(errors, /There is no "none" scenario\. Choose one: normal, 429, 529, slow/);
});
// #endregion practise
