// The Claude API client (Phase 11, lessons 1 to 3): the official SDK, @anthropic-ai/sdk, with the
// key from config.ts. It lives on the server, never in the browser: whoever has the key spends on
// the shop's account, and anyone can read everything that reaches the browser.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { modelRequest } from './conversation.ts';
import { definitions } from './tools/index.ts';

// #region instructions
// The assistant's instructions (the "system prompt"), in their own file and versioned like the
// code. They're read once, at startup: changing them needs a restart, like changing the code.
export const instructions = readFileSync(new URL('instructions.md', import.meta.url), 'utf8');
// #endregion instructions

// #region client
// Without ANTHROPIC_API_KEY there's no client, and the route answers 503 (route.ts).
// - maxRetries: the SDK repeats only what's passing (a 429, a 529 or any 5xx, a network cut),
//   waiting what the retry-after header says or, if there isn't one, a bit longer each time. With 2,
//   at most three attempts.
// - timeout: what each attempt waits, in milliseconds. Without it, 10 minutes: too long for someone
//   waiting for the answer in front of the screen. When streaming, it counts until the API starts
//   answering (its headers); after that, the events arrive when they arrive.
// - The API's address isn't set: the SDK reads ANTHROPIC_BASE_URL, and without it uses
//   https://api.anthropic.com. The tests point it at their fake model (test/fake-model.ts).
// How long a whole answer lasts, with its attempts and its waits, is cut by something else: each
// call's signal (below), with ASSISTANT_TIMEOUT_MS (config.ts).
// - openTelemetry (lesson 7): the SDK makes its own span for each call, anthropic.messages.create,
//   with OpenTelemetry's attributes for generative AI (gen_ai.*): the model, the input and output
//   tokens, the cache ones, the message's id and, in a stream, how long the first piece took; and
//   why the model stopped, in anthropic.message.stop_reason. It does it with the tracer provider
//   src/instrumentation.ts registers, so the span sits inside the request's, in Jaeger. Without
//   instrumentation, it does nothing. metadata_only: without the conversation's content, which is
//   the customer's (the log doesn't carry it either). It's what the SDK does if told nothing, but
//   written here it doesn't change even if someone sets
//   ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE=content in the environment.
export const client =
  config.ANTHROPIC_API_KEY === undefined
    ? undefined
    : new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        maxRetries: config.MODEL_RETRIES,
        timeout: config.MODEL_TIMEOUT_MS,
        openTelemetry: { traces: { contentMode: 'metadata_only' } },
      });
// #endregion client

// #region ask
// The request, with the tools the model can ask for (tools/index.ts, lesson 3).
const request = (conversation: Anthropic.MessageParam[]) =>
  modelRequest(
    conversation,
    instructions,
    { model: config.MODEL, effort: config.EFFORT },
    definitions,
  );

// A question to the model, with the whole conversation: POST /v1/messages. The SDK's errors come
// out as they are: what to do with each one is the route's decision (errors.ts). signal is the
// signal that cancels the call: when it fires (the assistant's time is up), the SDK cuts the
// connection to the API, and also stops waiting between one attempt and the next.
export function ask(
  client: Anthropic,
  conversation: Anthropic.MessageParam[],
  signal: AbortSignal,
): Promise<Anthropic.Message> {
  return client.messages.create(request(conversation), { signal });
}
// #endregion ask

// #region ask-streaming
// The same question, with the answer streamed (lesson 2): messages.stream() sends the same request
// with "stream": true, and the API answers with events (Server-Sent Events) as the model writes.
// What it returns is read event by event and, at the end, finalMessage() gives the whole message,
// as messages.create() would. Calling it doesn't wait for anything: the errors (a 429, a network
// cut) come out when reading the events. signal also fires when the customer leaves: the shop
// stops receiving an answer nobody is going to read.
//
// The tools don't carry eager_input_streaming: with it, the API would send what the model passes a
// tool as it writes it, without waiting to have it whole or checking it against its schema. It's
// for when that input is long (a whole file, a document); the shop's are a number or a word, which
// arrive at once anyway, and without it the API keeps checking them.
export function askStreaming(
  client: Anthropic,
  conversation: Anthropic.MessageParam[],
  signal: AbortSignal,
) {
  return client.messages.stream(request(conversation), { signal });
}
// #endregion ask-streaming
