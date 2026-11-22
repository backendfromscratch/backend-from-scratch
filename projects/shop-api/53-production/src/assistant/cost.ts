// What each call to the model costs (Phase 11, lesson 7). The API says it in every answer, in
// usage: how many tokens the model has read (and how many of them came from the cache or were
// stored in it) and how many it has written. With the prices in config.ts, that's dollars.
// The sums are pure functions; recordCall, at the end, takes them to the log and the metrics.
import type Anthropic from '@anthropic-ai/sdk';
import { config, type Price, PRICES } from '../config.ts';
import { log } from '../log.ts';
import { metrics } from '../metrics.ts';

// #region usage
// The tokens of one call, or of several added up, with the shop's names:
//   input       the ones the model reads that don't come from the cache (input_tokens);
//   output      the ones it writes, including what it thinks (output_tokens);
//   cacheRead   the ones it reads from the cache (cache_read_input_tokens);
//   cacheWrite  the ones it reads and are stored in the cache (cache_creation_input_tokens).
// Careful: input isn't everything the model reads. With the cache working, the instructions and
// the tools move from input to cacheRead: what it reads is the sum of the three.
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const NO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// The usage of a message from the model. The cache ones can arrive as null (the SDK declares them
// that way): then, 0.
export const usageOf = (usage: Anthropic.Usage): Usage => ({
  input: usage.input_tokens,
  output: usage.output_tokens,
  cacheRead: usage.cache_read_input_tokens ?? 0,
  cacheWrite: usage.cache_creation_input_tokens ?? 0,
});

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

// What counts for a customer's budget (budget.ts): everything the model reads and writes, whether
// it comes from the cache or not. The cache makes things cheaper for the shop, it doesn't stretch
// the budget: that way, the budget says how much each customer uses the assistant, and doesn't
// change if the cache fails.
export const tokensOf = (usage: Usage) =>
  usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
// #endregion usage

// #region cost
// A model's price. config.ts doesn't let the shop start with a MODEL without a price, so if the
// API answers with another name (it shouldn't), MODEL's applies.
export const priceOf = (model: string): Price => PRICES[model] ?? PRICES[config.MODEL]!;

// What a usage costs, in dollars: each kind of token at its price, which is per million tokens.
// Rounded to the hundred-millionth of a dollar: a short call costs a few ten-thousandths, and with
// more decimals only the noise of decimal arithmetic would show (0.1 + 0.2 = 0.30000000000000004).
//   cost = (input × price.input + cacheWrite × price.cacheWrite
//           + cacheRead × price.cacheRead + output × price.output) / 1,000,000
export function costInDollars(usage: Usage, price: Price): number {
  const dollars =
    (usage.input * price.input +
      usage.cacheWrite * price.cacheWrite +
      usage.cacheRead * price.cacheRead +
      usage.output * price.output) /
    1_000_000;
  return Math.round(dollars * 1e8) / 1e8;
}
// #endregion cost

// #region record
// After every call to the model (the assistant's, each round, and the worker's that writes
// descriptions): a line in the log with the tokens and the cost, and the metrics. context goes in
// the line as it is: the request's requestId (or the product, in the worker), to find it. Never the
// conversation: it's the customer's. Returns the usage, for the budget.
// The metrics, with the model and the kind of token as attributes: few values each, so few series
// (the cardinality of metrics.ts). Never the customer: one series per customer would grow without
// stopping. What each customer spends is counted by their budget, in Redis.
export function recordCall(message: Anthropic.Message, context: Record<string, unknown>): Usage {
  const usage = usageOf(message.usage);
  const costUsd = costInDollars(usage, priceOf(message.model));
  log.info(
    { ...context, model: message.model, message: message.id, usage, costUsd },
    'call to the model',
  );
  const model = message.model;
  metrics.aiTokens.add(usage.input, { model, kind: 'input' });
  metrics.aiTokens.add(usage.output, { model, kind: 'output' });
  metrics.aiTokens.add(usage.cacheRead, { model, kind: 'cache_read' });
  metrics.aiTokens.add(usage.cacheWrite, { model, kind: 'cache_write' });
  metrics.aiCost.add(costUsd, { model });
  return usage;
}
// #endregion record
