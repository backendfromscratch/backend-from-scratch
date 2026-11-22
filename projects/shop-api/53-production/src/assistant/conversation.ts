// The conversation with the model, without talking to anyone (Phase 11, lessons 1 and 3): how what
// the customer sends becomes a request to Claude's Messages API, and how what it answers is read.
// They are pure functions: the tests try them without a network, and client.ts and route.ts use
// them.
import type Anthropic from '@anthropic-ai/sdk';
import { addUsage, NO_USAGE, type Usage, usageOf } from './cost.ts';
import type { Result } from './loop.ts';
import { originOf, type Source } from './tools/tool.ts';

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
// #region cache
// From lesson 7, with caching (prompt caching). Every question starts the same: the tools and the
// instructions, about 1500 tokens (estimated: README, Phase 11) that the model reads over and over.
// With cache_control, the API stores what it has read up to that mark, and the next request that
// starts exactly the same reads it from the cache, at a tenth of the price (writing it the first
// time costs 1.25 times; config.ts, PRICES). The cache lasts 5 minutes from the last time it's used.
// Where the mark goes: the API reads the request in this order, tools, system and messages, and
// stores everything in front of the mark. Put on the instructions, the last block of what never
// changes, it stores the tools and the instructions together. On the conversation, no: it's
// different in every question, and marking it would mean paying 1.25 times to store something
// that's almost never read again. That's why system goes from text to a list of blocks: it's the
// way to put cache_control on it.
// What breaks the cache without warning: anything that changes from one request to another before
// the mark (the time or the customer's name in the instructions, the tools in another order). That's
// why the instructions are read from a file and the tools always go in the same order.
// And a minimum: with fewer than 512 tokens before the mark (on Claude Haiku 5.5), the API stores
// nothing, without any error. Whether something was stored or read, usage says it
// (cache_creation_input_tokens and cache_read_input_tokens): with both at 0, there was no cache.
export function modelRequest(
  conversation: Anthropic.MessageParam[],
  instructions: string,
  settings: Settings,
  tools: Anthropic.Tool[],
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: settings.model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: settings.effort },
    tools,
    messages: conversation,
  };
}
// #endregion cache
// #endregion request

// #region answer
// What the shop answers the customer (assistantAnswerSchema, in schemas.ts). sources, since lesson
// 6: the sections of the help the answer cites.
// usage, from lesson 7, with the cache's tokens (cost.ts): with it, the instructions and the tools
// no longer count in input, but in cacheRead.
export interface Answer {
  text: string;
  refused: boolean;
  usage: Usage;
  sources: Source[];
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
// With citations (lesson 6), a message's text arrives in several blocks (one for each cited piece,
// with its citations): textOf joins them, and the text is the same as without them.
// The sources, the sections the text cites (citedSources, below), out of the read ones: the ones
// runTool noted during the answer (tools/index.ts). If the model refused, none: the text is the
// shop's fixed sentence, and doesn't come from them.
export function modelAnswer({ messages, exhausted }: Result, read: Source[] = []): Answer {
  const usage = messages.reduce((sum, message) => addUsage(sum, usageOf(message.usage)), NO_USAGE);
  if (messages.at(-1)?.stop_reason === 'refusal') {
    return { text: REFUSAL_TEXT, refused: true, usage, sources: [] };
  }
  const texts = messages.map(textOf).filter((text) => text !== '');
  if (exhausted) texts.push(UNFINISHED_TEXT);
  const sources = withoutRepeats(citedSources(messages, read));
  return { text: texts.join(SEPARATOR), refused: false, usage, sources };
}

// #region cited-sources
// The sections the answer cites, in the order it cites them. With citations on, each piece of text
// that comes from a search result arrives in its own block, with its citations: which result it
// comes from (its source and its title, the ones the shop put there: originOf). The shop looks each
// citation up among the sections it gave the model (read), and the source is the shop's own: a
// citation that isn't from any of them doesn't count. A text that cites nothing (an "I don't know",
// a greeting) has no sources, even if the model read three sections to write it.
function citedSources(messages: Anthropic.Message[], read: Source[]): Source[] {
  const cited: Source[] = [];
  for (const block of messages.flatMap((message) => message.content)) {
    if (block.type !== 'text') continue;
    for (const citation of block.citations ?? []) {
      if (citation.type !== 'search_result_location') continue;
      const found = read.find((section) => {
        const { source, title } = originOf(section);
        return source === citation.source && title === citation.title;
      });
      if (found !== undefined) cited.push(found);
    }
  }
  return cited;
}
// #endregion cited-sources

// A source is the same if it's the same section of the same page: the first time it comes out, and
// no more (the model may cite the same section twice, or search twice and read it again).
function withoutRepeats(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter(({ page, section }) => {
    const key = `${page}#${section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
// #endregion answer
