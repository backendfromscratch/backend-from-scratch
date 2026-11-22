// The Claude API client (Phase 11, lesson 1): the official SDK, @anthropic-ai/sdk, with the key from
// config.ts. It lives on the server, never in the browser: whoever has the key spends on the shop's
// account, and anyone can read everything that reaches the browser.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { type Message, modelRequest } from './conversation.ts';

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
//   waiting for the answer in front of the screen.
// - The API's address isn't set: the SDK reads ANTHROPIC_BASE_URL, and without it uses
//   https://api.anthropic.com. The tests point it at their fake model (test/fake-model.ts).
// How long a whole answer lasts, with its attempts and its waits, is cut by something else: each
// call's signal (below), with ASSISTANT_TIMEOUT_MS (config.ts).
export const client =
  config.ANTHROPIC_API_KEY === undefined
    ? undefined
    : new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        maxRetries: config.MODEL_RETRIES,
        timeout: config.MODEL_TIMEOUT_MS,
      });
// #endregion client

// #region ask
// A question to the model, with the whole conversation: POST /v1/messages. The SDK's errors come
// out as they are: what to do with each one is the route's decision (errors.ts). signal is the
// signal that cancels the call: when it fires (the assistant's time is up), the SDK cuts the
// connection to the API, and also stops waiting between one attempt and the next.
export function ask(
  client: Anthropic,
  messages: Message[],
  signal: AbortSignal,
): Promise<Anthropic.Message> {
  return client.messages.create(
    modelRequest(messages, instructions, { model: config.MODEL, effort: config.EFFORT }),
    { signal },
  );
}
// #endregion ask
