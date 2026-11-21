// The evals' graders (Phase 11, lesson 7): each one looks at one thing the assistant has done in a
// case (which tools it used and with what, what it answered, what sources it read) and says whether
// it's right, and why not. Almost all of them are code: they check something exact, always the
// same, for free. One, judge, asks another model: for what code can't look at (whether a
// recommendation makes sense, whether the tone is the shop's).
import { isDeepStrictEqual } from 'node:util';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { type Usage, usageOf } from '../src/assistant/cost.ts';
import { config } from '../src/config.ts';
import type { Run } from './evaluate.ts';

// #region grader
// What a grader says: whether it's right and, if not, why. usage: the tokens it spent itself (only
// the judge, which calls the model), to add them to the case's cost.
export interface Grade {
  passed: boolean;
  reason: string;
  usage?: Usage;
}

export interface Grader {
  // What it looks at, for the table and for the failures: "calls get_order with {"id":21}".
  description: string;
  // true if a model decides it (LLM-as-judge), and not code: the table says so.
  judge?: boolean;
  grade(run: Run, client: Anthropic): Grade | Promise<Grade>;
}
// #endregion grader

// #region code
// It used that tool, at some point. With input, also with that exact input (compared as data, not
// as text: {"id":21} is the same with spaces or without them).
export function calls(name: string, input?: Record<string, unknown>): Grader {
  const description =
    input === undefined ? `calls ${name}` : `calls ${name} with ${JSON.stringify(input)}`;
  return {
    description,
    grade({ toolCalls }) {
      const its = toolCalls.filter((call) => call.name === name);
      if (its.length === 0) return { passed: false, reason: `it didn't call ${name}` };
      if (input === undefined) return { passed: true, reason: '' };
      const exact = its.some((call) => isDeepStrictEqual(call.input, input));
      const used = its.map((call) => JSON.stringify(call.input)).join(', ');
      return { passed: exact, reason: exact ? '' : `it called it with ${used}` };
    },
  };
}

// The answer says nothing of this: for the data it must not give (another customer's order's).
export function doesNotMention(...patterns: RegExp[]): Grader {
  return {
    description: `doesn't mention ${patterns.join(' or ')}`,
    grade({ answer }) {
      const said = patterns.find((pattern) => pattern.test(answer.text));
      return said === undefined
        ? { passed: true, reason: '' }
        : { passed: false, reason: `the answer says ${said}: "${answer.text}"` };
    },
  };
}

// The answer says this: a piece of data that has to be there (the price, the deadline).
export function mentions(pattern: RegExp): Grader {
  return {
    description: `mentions ${pattern}`,
    grade({ answer }) {
      return pattern.test(answer.text)
        ? { passed: true, reason: '' }
        : { passed: false, reason: `the answer doesn't say it: "${answer.text}"` };
    },
  };
}

// #region says-it-does-not-know
// It says it doesn't know, as the instructions ask when the help doesn't answer: that the help
// doesn't say, or the support email. With different words every time (the model doesn't repeat
// sentences), so it looks for the most common ways of saying it; if one day it says it another way,
// the failure shows the answer, and it's added here.
const DOES_NOT_KNOW =
  /support@shop\.example|(don['’]t|do not) know|(doesn['’]t|does not) (say|mention|cover|include)|no (information|mention)|(couldn['’]t|could not|can['’]t|cannot) find/i;

export function saysItDoesNotKnow(): Grader {
  return {
    description: "says it doesn't know",
    grade({ answer }) {
      return DOES_NOT_KNOW.test(answer.text)
        ? { passed: true, reason: '' }
        : { passed: false, reason: `it doesn't say it doesn't know: "${answer.text}"` };
    },
  };
}
// #endregion says-it-does-not-know

// It cites that help page: it's in its sources, the sections the answer cites (with the citations
// the API puts there, which the shop looks up among what search_help returned). Having read it
// isn't enough: an answer that doesn't cite it can't be checked.
export function withSource(page: string): Grader {
  return {
    description: `sources has the ${page} page`,
    grade({ answer }) {
      const pages = answer.sources.map((source) => source.page);
      return pages.includes(page)
        ? { passed: true, reason: '' }
        : { passed: false, reason: `sources: [${pages.join(', ')}]` };
    },
  };
}
// #endregion code

// #region judge
// LLM-as-judge: another model reads the question, the answer and a short rubric, and says whether it
// meets it. It's good for what code can't look at, but it has its limits, and you have to know them:
//   - it gets things wrong too, and not always the same way: the same case can pass today and fail
//     tomorrow;
//   - here it's the same model as the assistant (MODEL), the cheapest, and a model tends to accept
//     answers like its own;
//   - it costs tokens, like any call.
// That's why only one case uses it, with a concrete rubric (things that can be checked, not "is it
// a good answer?"), and a judge's failure is looked at by hand before believing it.
// The answer, with structured outputs: output_config.format with a schema, and the API guarantees
// the text is a JSON that meets it. The SDK reads it with Zod (messages.parse and zodOutputFormat)
// and leaves it in parsed_output.
const verdict = z.object({ meets: z.boolean(), reason: z.string() });

const JUDGE_INSTRUCTIONS = `You grade the answers of an online shop's assistant. You get a customer's question, the assistant's answer and a rubric. Say whether the answer meets every point of the rubric (meets) and, in one sentence, why (reason). Be strict: if a point isn't met, or you aren't sure it is, the answer doesn't meet it.`;

export function judge(rubric: string): Grader {
  return {
    description: `judge: ${rubric}`,
    judge: true,
    async grade({ question, answer }, client) {
      const message = await client.messages.parse({
        model: config.MODEL,
        max_tokens: 1024,
        system: JUDGE_INSTRUCTIONS,
        output_config: { effort: 'low', format: zodOutputFormat(verdict) },
        messages: [
          {
            role: 'user',
            content: `Rubric:\n${rubric}\n\nCustomer's question:\n${question}\n\nAssistant's answer:\n${answer.text}`,
          },
        ],
      });
      const usage = usageOf(message.usage);
      const read = message.parsed_output;
      if (!read) return { passed: false, reason: "the judge didn't give a verdict", usage };
      return { passed: read.meets, reason: read.reason, usage };
    },
  };
}
// #endregion judge
