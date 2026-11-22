// The conversation with the model, without talking to anyone (Phase 11, lesson 1): how what the
// customer sends becomes a request to Claude's Messages API, and how what it answers is read. They
// are pure functions: the tests try them without a network, and client.ts and route.ts use them.
import type Anthropic from '@anthropic-ai/sdk';

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

// The request: the model, the token limit, the instructions (system), the effort and the whole
// conversation, because the API doesn't remember anything from one request to the next. The API's
// roles are called user and assistant, like ours. It carries no temperature, top_p or top_k: current
// models reject them with a 400.
export function modelRequest(
  messages: Message[],
  instructions: string,
  settings: Settings,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: settings.model,
    max_tokens: MAX_TOKENS,
    system: instructions,
    output_config: { effort: settings.effort },
    messages: messages.map((message) => ({ role: message.role, content: message.text })),
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

// If the model refuses to answer (stop_reason: refusal), the shop doesn't show what it might have
// written up to there: it answers this sentence, always the same one.
export const REFUSAL_TEXT =
  "Sorry, I can't help with that. Can I help with something else from the shop?";

// The answer arrives as a list of blocks: text, what the model thinks (thinking), tools (lesson 3)…
// The customer gets only the text. And in usage, the tokens that are charged.
export function modelAnswer(message: Anthropic.Message): Answer {
  const usage = { input: message.usage.input_tokens, output: message.usage.output_tokens };
  if (message.stop_reason === 'refusal') return { text: REFUSAL_TEXT, refused: true, usage };
  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return { text, refused: false, usage };
}
// #endregion answer
