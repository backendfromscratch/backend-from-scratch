// POST /v2/assistant (Phase 11, lesson 1): the customer sends the conversation, the shop passes it
// to the model with its instructions and returns the answer and the tokens it cost. The route, with
// what it receives and what it answers, is in the contract (contract.ts and schemas.ts), like the
// rest of v2; requirePermission('assistant:use') has already checked it's a customer with their
// session, and OpenAPIHono, that the conversation matches the schema. v2.ts registers it.
import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { config } from '../config.ts';
import type * as contract from '../contract.ts';
import type { Env } from '../env.ts';
import { log } from '../log.ts';
import { problem, problemType, serverFailure } from '../problems.ts';
import {
  ipOf,
  type Limiter,
  limits,
  LimitsUnavailable,
  setHeaders,
  type State,
  storeUnavailable,
  tooManyAttempts,
} from '../rate-limits.ts';
import { ask, client } from './client.ts';
import { modelAnswer } from './conversation.ts';
import { modelFailure } from './errors.ts';

// Without ANTHROPIC_API_KEY: the shop works, but it has no assistant. No Retry-After: waiting won't
// fix it.
const noAssistant = (c: Context) =>
  problem(c, {
    type: problemType('assistant-not-configured'),
    title: 'The shop has no assistant',
    status: 503,
    detail: 'This shop is not configured to answer with an AI model',
  });

// #region answer
// The route's type comes from its definition in the contract: with it, c.req.valid('json') knows
// what it carries, and TypeScript checks every response against the contract.
type Route = RouteHandler<typeof contract.askAssistant, Env>;

export const answerAssistant: Route = async (c) => {
  if (client === undefined) return noAssistant(c);
  // Before spending anything, the question limits (further down): if it doesn't fit, the model
  // never hears about it.
  const limited = await checkLimits(c);
  if (limited !== undefined) return limited;
  const requestId = c.get('requestId');
  // #region deadline-and-signal
  // The time limit for the whole answer (config.ts): when it's up, this signal cancels the call to
  // the model, also while the SDK waits to repeat it.
  const deadline = AbortSignal.timeout(config.ASSISTANT_TIMEOUT_MS);
  // And the signal of the customer's request, c.req.raw.signal: @hono/node-server aborts it if the
  // connection closes before the response has gone out (the customer closes the tab, Ctrl + C in
  // curl). The call to the model gets both together (AbortSignal.any), and the first one to fire
  // cancels it: that way the shop doesn't keep waiting, and paying, for an answer nobody will read.
  const signal = AbortSignal.any([deadline, c.req.raw.signal]);
  // #endregion deadline-and-signal
  try {
    const message = await ask(client, c.req.valid('json').messages, signal);
    const answer = modelAnswer(message);
    // A refusal isn't an error: the customer gets the shop's fixed sentence. The log gets the
    // message id and the category the API gives (never the conversation, which is the customer's).
    if (answer.refused) {
      log.warn(
        { requestId, message: message.id, category: message.stop_details?.category ?? null },
        'the model refused to answer',
      );
    }
    return c.json(answer, 200);
  } catch (error) {
    const failure = modelFailure(error);
    if (failure === undefined) throw error;
    if (c.req.raw.signal.aborted) {
      // The customer has left, and their signal cancelled the call (APIUserAbortError): it isn't a
      // failure of the model, and the log gets only that. The response, the 503 below, nobody
      // reads.
      log.info({ requestId }, 'the customer left: cancelling the call to the model');
    } else if (failure.status === 500) {
      // The API rejected the shop's request: the log gets what it said (the status code, the type
      // and its message, inside err). The customer, the same 500 as any other server failure.
      log.error({ err: error, requestId }, "the model's API rejected the shop's request");
    } else {
      log.warn({ err: error, requestId }, 'the model is not available');
    }
    if (failure.status === 500) return serverFailure(c);
    return problem(
      c,
      {
        type: problemType('assistant-not-available'),
        title: 'The assistant is not available right now',
        status: 503,
        detail: `${failure.detail}: try again in ${failure.retryAfter} seconds`,
      },
      { 'Retry-After': String(failure.retryAfter) },
    );
  }
};
// #endregion answer

// #region limits
// Every question counts twice (rate-limits.ts): on its customer's count and on its IP's. If either
// is full, 429 with Retry-After. If both fit, they're recorded before asking the model, and the
// response carries the RateLimit headers with what's left. If Redis doesn't answer, the limits
// close (LimitsUnavailable): 503, as when signing in. It returns that error response, or undefined
// if the question fits.
async function checkLimits(c: Context<Env>) {
  const byCustomer = String(c.var.user!.id);
  const byIp = ipOf(c);
  const check = async (): Promise<[Limiter, State][]> => [
    [limits.assistantByCustomer, await limits.assistantByCustomer.check(byCustomer)],
    [limits.assistantByIp, await limits.assistantByIp.check(byIp)],
  ];
  try {
    const before = await check();
    if (before.some(([, state]) => !state.allowed)) return tooManyAttempts(c, before);
    await limits.assistantByCustomer.record(byCustomer);
    await limits.assistantByIp.record(byIp);
    setHeaders(c, await check());
    return undefined;
  } catch (error) {
    if (error instanceof LimitsUnavailable) {
      return storeUnavailable(
        c,
        "Right now the assistant can't answer. Try again in a few seconds",
      );
    }
    throw error;
  }
}
// #endregion limits
