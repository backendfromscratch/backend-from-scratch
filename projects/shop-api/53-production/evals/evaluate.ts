// What runs the evals (Phase 11, lesson 7). An eval is a test for something that doesn't always
// answer the same: the assistant. Each case is a customer's question; the assistant answers it as
// in the shop (the same instructions, the same tools, the same model), and some graders
// (graders.ts) look at what it did. At the end, a table: which cases pass, how many tokens they
// spent and how much they cost. After changing the instructions, a tool or the model, they're run
// again, and you see whether the change made the assistant better or worse.
// It runs inside the process, without HTTP: that way it sees what doesn't come out in the route's
// answer, which tools the model asked for and with what. It doesn't go through the question limits
// or the budget: whoever runs the shop runs it, not a customer. run.ts starts it (npm run evals),
// against the real model; test/evals.test.ts, against the fake model.
import type Anthropic from '@anthropic-ai/sdk';
import { ask } from '../src/assistant/client.ts';
import { type Answer, apiMessages, modelAnswer } from '../src/assistant/conversation.ts';
import {
  addUsage,
  costInDollars,
  NO_USAGE,
  priceOf,
  tokensOf,
  type Usage,
  usageOf,
} from '../src/assistant/cost.ts';
import { converse } from '../src/assistant/loop.ts';
import { runTool } from '../src/assistant/tools/index.ts';
import type { RunAs, Source } from '../src/assistant/tools/tool.ts';
import { config } from '../src/config.ts';
import type { Grader } from './graders.ts';

// #region types
// A case: a short name, the customer's question and what is checked.
export interface Case {
  id: string;
  question: string;
  graders: Grader[];
}

// A call to a tool during the case: which, with what input and what it returned.
export interface ToolCall {
  name: string;
  input: unknown;
  result: Anthropic.ToolResultBlockParam;
}

// What happened in a case: what the customer sees (the answer, with its sources), what they don't
// see (the calls to tools) and the tokens of every round.
export interface Run {
  question: string;
  answer: Answer;
  toolCalls: ToolCall[];
  usage: Usage;
}

export interface CaseResult {
  id: string;
  judge: boolean;
  passed: boolean;
  failures: string[];
  tokens: number;
  costUsd: number;
}
// #endregion types

// #region run-case
// The question, answered as in the route (assistant/route.ts, without streaming): the same loop, the
// same request (client.ts, with its cache) and the same tools, which work for runAs (the practice
// customer). Each call to a tool is noted before it's returned to the loop.
export async function runCase(item: Case, client: Anthropic, runAs: RunAs): Promise<Run> {
  const toolCalls: ToolCall[] = [];
  const read: Source[] = [];
  let usage = NO_USAGE;
  const signal = AbortSignal.timeout(config.ASSISTANT_TIMEOUT_MS);
  const result = await converse(apiMessages([{ role: 'user', text: item.question }]), {
    ask: async (conversation) => {
      const message = await ask(client, conversation, signal);
      usage = addUsage(usage, usageOf(message.usage));
      return message;
    },
    run: async (call) => {
      const result = await runTool(call, runAs, `eval-${item.id}`, read);
      toolCalls.push({ name: call.name, input: call.input, result });
      return result;
    },
  });
  return { question: item.question, answer: modelAnswer(result, read), toolCalls, usage };
}
// #endregion run-case

// #region evaluate
// All the cases, one after the other (at the same time they'd go faster, but they'd hit the API's
// limits sooner, and the table would come out in another order each time), and their graders. A
// case that fails with an error (the API doesn't answer, for example) doesn't stop the others: it
// comes out as not passed, with the error. Each case's cost includes the judge's, if it has one.
export async function evaluate(
  cases: Case[],
  { client, runAs }: { client: Anthropic; runAs: RunAs },
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const item of cases) {
    const judge = item.graders.some((grader) => grader.judge === true);
    let usage = NO_USAGE;
    const failures: string[] = [];
    try {
      const run = await runCase(item, client, runAs);
      usage = run.usage;
      for (const grader of item.graders) {
        const grade = await grader.grade(run, client);
        if (grade.usage) usage = addUsage(usage, grade.usage);
        if (!grade.passed) failures.push(`${grader.description}: ${grade.reason}`);
      }
    } catch (error) {
      failures.push(`error: ${(error as Error).message}`);
    }
    results.push({
      id: item.id,
      judge,
      passed: failures.length === 0,
      failures,
      tokens: tokensOf(usage),
      costUsd: costInDollars(usage, priceOf(config.MODEL)),
    });
  }
  return results;
}
// #endregion evaluate

// #region table
// The table, as text: one row per case (whether code or the judge decides it, whether it passes,
// its tokens and its cost), under each one that fails, why, and at the end, the total.
export function table(results: CaseResult[]): string {
  const width = Math.max(4, ...results.map((result) => result.id.length));
  const row = (columns: string[]) =>
    [
      columns[0]!.padEnd(width),
      columns[1]!.padEnd(6),
      columns[2]!.padEnd(6),
      columns[3]!.padStart(7),
      columns[4]!.padStart(10),
    ].join('  ');
  const lines = [row(['case', 'how', 'passes', 'tokens', 'cost ($)'])];
  for (const result of results) {
    lines.push(
      row([
        result.id,
        result.judge ? 'judge' : 'code',
        result.passed ? 'yes' : 'NO',
        String(result.tokens),
        result.costUsd.toFixed(6),
      ]),
    );
    for (const failure of result.failures) lines.push(`    - ${failure}`);
  }
  const passed = results.filter((result) => result.passed).length;
  const tokens = results.reduce((sum, result) => sum + result.tokens, 0);
  const cost = results.reduce((sum, result) => sum + result.costUsd, 0);
  lines.push(
    '',
    `${passed} of ${results.length} pass. In total: ${tokens} tokens, $${cost.toFixed(6)} (${config.MODEL}).`,
  );
  return lines.join('\n');
}
// #endregion table
