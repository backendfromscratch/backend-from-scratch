// A fake AI model for the tests (Phase 11): a small HTTP server that speaks the part of Claude's
// Messages API (POST /v1/messages) the shop uses. The tests never call the real model: it would cost
// money, need a key and answer something different every time. The shop's SDK gets here because
// ANTHROPIC_BASE_URL points at this server. Outside the tests, scripts/fake-model.ts starts it for
// you to practise with (npm run fake-model).
//
// #region how-to-use
//   const model = await startFakeModel();       // on a free port of 127.0.0.1
//   process.env.ANTHROPIC_BASE_URL = model.url;  // before importing the shop
//   model.script(text('Hi!'));                   // what the next request will be answered
//   …                                            // the request to the shop
//   model.requests[0]!.body                      // what the shop sent it
//   await model.requests[0]!.finished            // 'whole', or 'cut' if the shop hung up first
//   model.reset();                               // no script and no requests, for the next test
//   await model.close();
// #endregion how-to-use
//
// Each request takes the first turn left in the script. A turn is a message (with its blocks: text
// or tool calls), an API error (a 429, a 529…) or a silence (it never answers: to try the timeout).
// Every message also starts with an empty, signed thinking block (thinking(), below), like Claude
// Haiku 5.5's. If the request carries "stream": true, the message arrives as events (Server-Sent
// Events), in the order and with the shape the real API sends: all at once or, with a pause, little
// by little (so a test can leave halfway, lesson 2). And a stream can break halfway: with an error
// event, as the API does when it gets overloaded in the middle of an answer, or with the connection
// cut. With no turns in the script, it answers a 500 that says so.
// Since lesson 6, a text block can carry citations (which search result it comes from), and the
// stream sends them like the API, with citations_delta. And, like the API, it rejects with a 400 a
// request with badly made search results (search_result) (requestProblem).
import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

// #region turns
// A citation (lesson 6), as the API sends it when the text comes from a search_result block: the
// cited text, the result's source and title, its position among all the search_result blocks of
// the request (search_result_index) and which blocks of its content it cites (from
// start_block_index to end_block_index, not including the latter).
export interface Citation {
  type: 'search_result_location';
  cited_text: string;
  source: string;
  title: string | null;
  search_result_index: number;
  start_block_index: number;
  end_block_index: number;
}

// A block of the answer's content, with the API's names: text (with its citations, if it has any),
// a call to one of the shop's tools (tool_use, lesson 3) or what the model thinks first
// (thinking).
export type Block =
  | { type: 'text'; text: string; citations?: Citation[] }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: string; signature: string };

// Why the model stopped (stop_reason): it finished, it wants to use a tool, it reached the token
// limit or it refused.
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';

// The tokens it says it spent: the input ones (instructions and conversation) and the output ones.
export interface Usage {
  input: number;
  output: number;
}

export interface MessageTurn {
  kind: 'message';
  content: Block[];
  stopReason: StopReason;
  // Only in a refusal: the category of the policy that caused it.
  category?: string | null;
  usage: Usage;
  // With stream: the milliseconds between one event and the next. Without stream, the whole answer
  // takes as long as its stream would, and arrives at once at the end. Without a pause, all at once.
  pause?: number;
  // With stream: what breaks the stream halfway, after the text of the first block (the one after
  // the thinking; errorMidStream): an API error, as an event, or 'cut', the connection closed and
  // nothing more. Without stream, the response is that error, with its status code, or the
  // connection closed without an answer.
  midStreamError?: ErrorTurn | 'cut';
}

export interface ErrorTurn {
  kind: 'error';
  status: number;
  errorType: string;
  message: string;
  headers: Record<string, string>;
}

export type Turn = MessageTurn | ErrorTurn | { kind: 'silence' };

const DEFAULT_USAGE: Usage = { input: 120, output: 30 };

/** A message with these blocks. By default, it ends with end_turn. With pause, its stream is slow. */
export function message(
  content: Block[],
  {
    stopReason = 'end_turn',
    usage = DEFAULT_USAGE,
    pause,
  }: { stopReason?: StopReason; usage?: Usage; pause?: number } = {},
): Turn {
  return { kind: 'message', content, stopReason, usage, ...(pause === undefined ? {} : { pause }) };
}

/** A text block. */
export const textBlock = (text: string): Block => ({ type: 'text', text });

/**
 * A text block with a citation (lesson 6): the text comes from the request's search result number
 * index (the first one, 0), which has that source, that title and that text.
 */
export const citedBlock = (
  text: string,
  result: { index: number; source: string; title: string; text: string },
): Block => ({
  type: 'text',
  text,
  citations: [
    {
      type: 'search_result_location',
      cited_text: result.text,
      source: result.source,
      title: result.title,
      search_result_index: result.index,
      start_block_index: 0,
      end_block_index: 1,
    },
  ],
});

/** A call to a tool: its name and what it passes it (input). */
export const toolUseBlock = (
  name: string,
  input: Record<string, unknown>,
  id = `toolu_fake_${name}`,
): Block => ({ type: 'tool_use', id, name, input });

/**
 * The model asks for tools (lesson 3): these blocks (calls and, if wanted, text before them), and
 * stop_reason tool_use, which is what the API does when it stops for the shop to run them.
 */
export const asksForTools = (...content: Block[]) => message(content, { stopReason: 'tool_use' });

/** The most common answer: a single text block. */
export const text = (content: string, options: { usage?: Usage; pause?: number } = {}) =>
  message([textBlock(content)], options);

/** The model refuses to answer: stop_reason refusal, with the category in stop_details. */
export function refusal(category: string | null = 'cyber', content: Block[] = []): Turn {
  return { kind: 'message', content, stopReason: 'refusal', category, usage: DEFAULT_USAGE };
}

/** An API error: the status code, its type (error.type) and its message. */
export function apiError(
  status: number,
  errorType: string,
  message: string,
  headers: Record<string, string> = {},
): ErrorTurn {
  return { kind: 'error', status, errorType, message, headers };
}

/** 429: too many requests. With seconds, the retry-after header. */
export const rateLimited = (seconds?: number) =>
  apiError(
    429,
    'rate_limit_error',
    'Number of request tokens has exceeded your per-minute rate limit',
    seconds === undefined ? {} : { 'retry-after': String(seconds) },
  );

/** 529: the API is overloaded. */
export const overloaded = () => apiError(529, 'overloaded_error', 'Overloaded');

/** It never answers: the client has to give up (its timeout). */
export const silence = (): Turn => ({ kind: 'silence' });

/**
 * The thinking block every message of the fake model starts with; n is the number of the request
 * that gets it (the first one after reset(), 1). Claude Haiku 5.5 thinks before answering (adaptive
 * thinking is on unless told otherwise) and doesn't show what it thinks (display: omitted, also the
 * default): the block arrives with empty text and a signature, which carries the thinking,
 * encrypted. If the conversation goes on with tools (lesson 3), the shop has to send it back as it
 * is.
 */
export const thinking = (n: number): Block => ({
  type: 'thinking',
  thinking: '',
  signature: `fake-signature-${n}`,
});

/**
 * With stream, the API answers 200 and starts sending this text; halfway, it sends an error event
 * (with the error's type: overloaded_error, if it's overloaded()) and closes the response. It's
 * what the real API does when it gets overloaded in the middle of an answer: the status code has
 * already gone out, so the error arrives as one more event. With 'cut', instead of the event, the
 * connection just closes (a network cut). Without stream, it answers the error with its status.
 */
export function errorMidStream(content: string, error: ErrorTurn | 'cut' = overloaded()): Turn {
  return {
    kind: 'message',
    content: [textBlock(content)],
    stopReason: 'end_turn',
    usage: DEFAULT_USAGE,
    midStreamError: error,
  };
}
// #endregion turns

// #region server
/** A request it received: the path, the headers and the body (the JSON, already read). */
export interface ReceivedRequest {
  path: string;
  headers: IncomingHttpHeaders;
  // The JSON as it arrived: each test looks at what it needs.
  body: any;
  // Settles when this response's connection closes: 'whole' if the fake model got to send all of
  // it, 'cut' if the shop hung up first (the timeout, or the customer leaving).
  finished: Promise<'whole' | 'cut'>;
}

export interface FakeModel {
  /** http://127.0.0.1:<port>: what goes in ANTHROPIC_BASE_URL. */
  url: string;
  /** Adds turns at the end of the script. */
  script(...turns: Turn[]): void;
  /** The requests received, in order. */
  requests: ReceivedRequest[];
  /** Empties the script and the requests, and counts from 1 again. */
  reset(): void;
  close(): Promise<void>;
}

// How to start it. The tests pass nothing: a free port of 127.0.0.1, and each request takes a turn
// from its script. scripts/fake-model.ts gives it a fixed port, where to listen (in Docker,
// 0.0.0.0, so the other containers can find it) and fallback: the turn it answers with when the
// script is empty, decided with what the shop sent (the body).
export interface FakeModelOptions {
  port?: number;
  host?: string;
  fallback?: (body: any) => Turn;
}

export async function startFakeModel({
  port = 0,
  host = '127.0.0.1',
  fallback,
}: FakeModelOptions = {}): Promise<FakeModel> {
  const turns: Turn[] = [];
  const requests: ReceivedRequest[] = [];
  let counter = 0;

  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const path = req.url ?? '';
    if (req.method !== 'POST' || path !== '/v1/messages') {
      return answerError(res, apiError(404, 'not_found_error', `${path} does not exist`));
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return answerError(res, apiError(400, 'invalid_request_error', 'The body is not JSON'));
    }
    const problem = requestProblem(body);
    if (problem !== undefined) {
      return answerError(res, apiError(400, 'invalid_request_error', problem));
    }
    // writableFinished: whether the response went out whole before the connection closed.
    const finished = new Promise<'whole' | 'cut'>((resolve) =>
      res.once('close', () => resolve(res.writableFinished ? 'whole' : 'cut')),
    );
    requests.push({ path, headers: req.headers, body, finished });
    counter += 1;
    res.setHeader('request-id', `req_fake_${counter}`);

    const turn = turns.shift() ?? fallback?.(body);
    if (turn === undefined) {
      return answerError(
        res,
        apiError(500, 'api_error', 'The fake model has no more turns: add one with script()'),
      );
    }
    if (turn.kind === 'silence') return; // the response stays open, with nothing
    if (turn.kind === 'error') return answerError(res, turn);
    const full = fullMessage(turn, counter, body.model);
    if (body.stream === true) {
      const events = streamEvents(full, turn.midStreamError);
      return answerStream(res, events, turn.pause ?? 0, turn.midStreamError === 'cut');
    }
    if (turn.midStreamError === 'cut') return res.destroy();
    if (turn.midStreamError) return answerError(res, turn.midStreamError);
    // Without stream, with a pause, the answer takes as long as its stream would, and arrives whole:
    // the API doesn't answer until it has written all of it. If the shop left meanwhile, there's no
    // one to give it to.
    if (turn.pause) await sleep(turn.pause * (streamEvents(full).length - 1));
    if (res.destroyed) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(full));
  });
  server.listen(port, host);
  await once(server, 'listening');
  const address = server.address() as { port: number };

  return {
    // Listening on every address (0.0.0.0), also on 127.0.0.1.
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`,
    script: (...added) => turns.push(...added),
    requests,
    reset() {
      turns.length = 0;
      requests.length = 0;
      counter = 0;
    },
    async close() {
      // The responses left open (a silence) wouldn't let the server close.
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
// #endregion server

// #region request
// The API's rules for search results (lesson 6) that the fake model checks, so a test fails if the
// shop sends them wrong, as it would fail with the real API. A tool_result that carries any
// search_result can only carry search_result blocks; each one with its source, its title and at
// least one non-empty text block; and all of the request's ones with the same citation setting (all
// on or all off). It returns the problem, or undefined if there's none.
type ReceivedBlock = { type?: string; [field: string]: unknown };

export function requestProblem(body: {
  messages?: { role: string; content: unknown }[];
}): string | undefined {
  const citations = new Set<boolean>();
  for (const message of body.messages ?? []) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content as ReceivedBlock[]) {
      if (block.type !== 'tool_result' || !Array.isArray(block.content)) continue;
      const inside = block.content as ReceivedBlock[];
      const results = inside.filter((part) => part.type === 'search_result');
      if (results.length === 0) continue;
      if (results.length !== inside.length) {
        return 'tool_result: if one block is a search_result, all of them must be';
      }
      for (const result of results) {
        const content = result.content as ReceivedBlock[] | undefined;
        if (typeof result.source !== 'string' || typeof result.title !== 'string') {
          return 'search_result: source and title are required';
        }
        const empty = (part: ReceivedBlock) =>
          part.type !== 'text' || typeof part.text !== 'string' || part.text === '';
        if (!Array.isArray(content) || content.length === 0 || content.some(empty)) {
          return 'search_result: content must be a list of non-empty text blocks';
        }
        citations.add((result.citations as { enabled?: boolean } | undefined)?.enabled === true);
      }
    }
  }
  if (citations.size > 1) {
    return 'search_result: citations must be enabled on all of them or on none';
  }
  return undefined;
}
// #endregion request

// #region answers
// An error, as the API sends it: the status code and a JSON with type: 'error'.
function answerError(res: ServerResponse, turn: ErrorTurn) {
  res.writeHead(turn.status, { 'content-type': 'application/json', ...turn.headers });
  res.end(
    JSON.stringify({
      type: 'error',
      error: { type: turn.errorType, message: turn.message },
      request_id: res.getHeader('request-id') ?? null,
    }),
  );
}

// The whole message, as the API returns it without streaming: the one of request number n, which
// starts with its thinking block.
function fullMessage(turn: MessageTurn, n: number, model: string) {
  return {
    id: `msg_fake_${n}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [thinking(n), ...turn.content],
    stop_reason: turn.stopReason,
    stop_sequence: null,
    stop_details:
      turn.stopReason === 'refusal'
        ? { type: 'refusal', category: turn.category ?? null, explanation: null }
        : null,
    usage: {
      input_tokens: turn.usage.input,
      output_tokens: turn.usage.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

// The same message, as events (Server-Sent Events), in the API's order: message_start (the message
// without content), a ping, and for each block content_block_start, its pieces
// (content_block_delta: text_delta for text, citations_delta for each of its citations,
// input_json_delta for what's passed to a tool, as JSON in pieces; for the thinking, an empty
// thinking_delta and a signature_delta with the signature) and content_block_stop; at the end,
// message_delta (why it stopped and the output tokens) and message_stop. With an error midway, the
// stream goes up to the text of the first block after the thinking, and instead of its
// content_block_stop and everything after it comes the error event, with the same shape as an
// error's body (type: 'error' and, inside, the type and the message); with a cut, nothing more.
type Event = { type: string; [field: string]: unknown };

function streamEvents(
  full: ReturnType<typeof fullMessage>,
  midStreamError?: ErrorTurn | 'cut',
): Event[] {
  const events: Event[] = [
    {
      type: 'message_start',
      message: {
        ...full,
        content: [],
        stop_reason: null,
        stop_details: null,
        usage: { ...full.usage, output_tokens: 1 },
      },
    },
    { type: 'ping' },
  ];
  full.content.forEach((block, index) => {
    if (block.type === 'thinking') {
      events.push(
        {
          type: 'content_block_start',
          index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'thinking_delta', thinking: block.thinking },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'signature_delta', signature: block.signature },
        },
      );
    } else if (block.type === 'text') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      for (const piece of pieces(block.text)) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: piece },
        });
      }
      // The block's citations, one per event, after its text (lesson 6).
      for (const citation of block.citations ?? []) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'citations_delta', citation },
        });
      }
    } else {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      });
      for (const piece of ['', ...pieces(JSON.stringify(block.input))]) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: piece },
        });
      }
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push(
    {
      type: 'message_delta',
      delta: {
        stop_reason: full.stop_reason,
        stop_sequence: null,
        stop_details: full.stop_details,
      },
      usage: { output_tokens: full.usage.output_tokens },
    },
    { type: 'message_stop' },
  );
  if (midStreamError === undefined) return events;
  const first = full.content.findIndex((block) => block.type !== 'thinking');
  const upTo = events.findIndex(
    (event) => event.type === 'content_block_stop' && event.index === first,
  );
  if (midStreamError === 'cut') return events.slice(0, upTo);
  return [
    ...events.slice(0, upTo),
    { type: 'error', error: { type: midStreamError.errorType, message: midStreamError.message } },
  ];
}

// Each event is two lines, event: and data:, and a blank one. With a pause, each one waits that
// long before going out (not the first: the headers and message_start go out at once, as in the
// API). If the shop hangs up halfway, it stops writing. With cut, at the end the connection closes
// abruptly instead of finishing the response: first it waits for what was written to go out
// (destroy() drops what hasn't gone out yet, and it would be a cut before starting).
async function answerStream(res: ServerResponse, events: Event[], pause: number, cut: boolean) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  let sent: Promise<unknown> = Promise.resolve();
  for (const [i, data] of events.entries()) {
    if (i > 0 && pause > 0) await sleep(pause);
    if (res.destroyed) return;
    const event = `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
    sent = new Promise((done) => res.write(event, done));
  }
  if (!cut) return res.end();
  await sent;
  res.destroy();
}

// A text in pieces of a few letters, the way tokens arrive.
function pieces(text: string): string[] {
  return text.match(/.{1,8}/gsu) ?? [];
}
// #endregion answers
