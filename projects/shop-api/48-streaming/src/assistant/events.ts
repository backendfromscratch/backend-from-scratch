// The assistant's streaming events (Phase 11, lesson 2). The model sends its own events
// (message_start, content_block_delta, message_delta…), with the shape its API decides; the shop
// doesn't pass them on to the browser as they are, but translates them into its own, few and with
// its own names. That way the frontend only knows the shop's events: if tomorrow the model changes,
// or its API, this translation changes and the frontend doesn't notice. They're pure functions: the
// tests try them without a network, and route.ts uses them.
import type Anthropic from '@anthropic-ai/sdk';
import type { Problem } from '../problems.ts';
import type { Answer } from './conversation.ts';

// #region events
// What the shop sends down the stream: each event with its name (the event: line) and its data (the
// data: line, in JSON).
//   text   one more piece of the answer, as it arrives from the model: { text }. All of them
//          together, in order, are the whole answer.
//   end    the answer has finished. Its data is the same answer as without streaming (modelAnswer,
//          in conversation.ts): the whole text, whether the model refused and the tokens it cost.
//          If it refused, refused is true and the text is the shop's fixed sentence: the frontend
//          replaces whatever it has shown so far with it.
//   error  something failed halfway: a Problem Details, like the body of any of the shop's errors.
//          Then the stream closes, with no end.
// Lesson 3 adds one more, tool (what the assistant is doing: "searching products…"): one more line
// in this type and its translation below; route.ts writes them all the same way (asSSE).
export type AssistantEvent =
  | { event: 'text'; data: { text: string } }
  | { event: 'end'; data: Answer }
  | { event: 'error'; data: Problem };
// #endregion events

// #region translate
// A model event, as one of the shop's; undefined if there's nothing to tell the customer. Only the
// pieces of text (text_delta) go through. The rest stays in the shop: message_start and
// message_delta carry the tokens and why it stopped, which arrive together in end; what the model
// thinks before answering (thinking) isn't for the customer; and the others only mark where each
// block starts and ends.
export function shopEvent(event: Anthropic.MessageStreamEvent): AssistantEvent | undefined {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    return { event: 'text', data: { text: event.delta.text } };
  }
  return undefined;
}
// #endregion translate

// #region sse
// Each event, the way Hono's writeSSE writes it: event: with the name and data: with the data in
// JSON. JSON.stringify writes a line break in the text as \n, so the data takes a single data:
// line, even if the text has several.
export function asSSE(event: AssistantEvent): { event: string; data: string } {
  return { event: event.event, data: JSON.stringify(event.data) };
}
// #endregion sse
