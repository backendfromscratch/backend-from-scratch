// The conversation with the model, without talking to anyone (Phase 11, lessons 1 and 3): how what
// the customer sends becomes a request to Claude's Messages API, and how what it answers is read.
// They are pure functions: the tests try them without a network, and client.ts and route.ts use
// them.
import type Anthropic from '@anthropic-ai/sdk';
import type { Result } from './loop.ts';

// #region message
// A message of the conversation, as the shop's frontend sends it (schemas.ts): who says it and what
// it says.
export interface Message {
  role: 'user' | 'assistant';
  text: string;
}

// What is chosen in config.ts: the model and how much effort it puts in.
export interface Settings {
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}
// #endregion message

// #region request
// The longest an answer can be, in tokens (a token is a piece of a word). A short answer is a few
// hundred; the rest leaves room for what the model thinks before answering, which counts too. If it
// reaches the limit, the answer is cut (stop_reason: max_tokens).
export const MAX_TOKENS = 2048;

// The customer's messages, with the API's names: the roles are called user and assistant, like
// ours, and the text goes in content.
export function apiMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages.map((message) => ({ role: message.role, content: message.text }));
}

// The request: the model, the token limit, the instructions (system), the effort, the tools it can
// ask for (tools, lesson 3) and the whole conversation, because the API doesn't remember anything
// from one request to the next. With tools, the conversation also carries their calls and their
// results (loop.ts). It carries no temperature, top_p or top_k: current models reject them with a
// 400.
export function modelRequest(
  conversation: Anthropic.MessageParam[],
  instructions: string,
  settings: Settings,
  tools: Anthropic.Tool[],
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: settings.model,
    max_tokens: MAX_TOKENS,
    system: instructions,
    output_config: { effort: settings.effort },
    tools,
    messages: conversation,
  };
}
// #endregion request

// #region answer
// What the shop answers the customer (assistantAnswerSchema, in schemas.ts).
export interface Answer {
  text: string;
  refused: boolean;
  usage: { input: number; output: number };
}

// If the model refuses to answer (stop_reason: refusal), the shop's answer is this sentence, always
// the same one, and not what the model might have written up to there. In JSON, that never reaches
// the customer; when streaming (lesson 2), its pieces have already reached them as they were
// written, and the end event, with refused: true and this sentence, tells the frontend to replace
// them with it.
export const REFUSAL_TEXT =
  "Sorry, I can't help with that. Can I help with something else from the shop?";

// If the model reaches MAX_ROUNDS still asking for tools (loop.ts), the answer ends with this
// sentence, after whatever it wrote.
export const UNFINISHED_TEXT =
  "Sorry, I couldn't finish looking into it. Could you ask me another way?";

// Between one round's text and the next one's (the model writes "Let me check.", asks for a tool
// and, with its result, goes on), a blank line: without it, the sentences would come out stuck
// together ("Let me check.Your order…").
export const SEPARATOR = '\n\n';

// A message's text. The answer arrives as a list of blocks: text, what the model thinks (thinking),
// calls to tools… The customer gets only the text.
export const textOf = (message: Anthropic.Message) =>
  message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');

// The answer, with the messages of every round (loop.ts): each one's text, separated, and the tokens
// that are charged, added up (usage, in each message: every round is paid in full).
export function modelAnswer({ messages, exhausted }: Result): Answer {
  const usage = { input: 0, output: 0 };
  for (const message of messages) {
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
  }
  if (messages.at(-1)?.stop_reason === 'refusal') {
    return { text: REFUSAL_TEXT, refused: true, usage };
  }
  const texts = messages.map(textOf).filter((text) => text !== '');
  if (exhausted) texts.push(UNFINISHED_TEXT);
  return { text: texts.join(SEPARATOR), refused: false, usage };
}
// #endregion answer
