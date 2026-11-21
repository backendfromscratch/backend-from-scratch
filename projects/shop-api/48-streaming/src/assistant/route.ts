// POST /v2/assistant (Phase 11, lessons 1 and 2): the customer sends the conversation, the shop
// passes it to the model with its instructions and returns the answer and the tokens it cost. Whole,
// in JSON, or, if the customer asks for it streamed (Accept: text/event-stream), piece by piece, as
// the model writes it. The route, with what it receives and what it answers, is in the contract
// (contract.ts and schemas.ts), like the rest of v2; requirePermission('assistant:use') has already
// checked it's a customer with their session, and OpenAPIHono, that the conversation matches the
// schema. v2.ts registers it.
import type Anthropic from '@anthropic-ai/sdk';
import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { accepts } from 'hono/accepts';
import { streamSSE } from 'hono/streaming';
import { config } from '../config.ts';
import type * as contract from '../contract.ts';
import type { Env } from '../env.ts';
import { log } from '../log.ts';
import { type Problem, problem, problemType, serverFailure, serverProblem } from '../problems.ts';
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
import { ask, askStreaming, client } from './client.ts';
import { type Message, modelAnswer } from './conversation.ts';
import { type Failure, modelFailure, notAvailable } from './errors.ts';
import { asSSE, shopEvent } from './events.ts';

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
  const { messages } = c.req.valid('json');
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
  if (wantsStream(c)) return answerStreaming(c, client, messages, signal);
  try {
    const message = await ask(client, messages, signal);
    const answer = modelAnswer(message);
    if (answer.refused) warnRefusal(c.get('requestId'), message);
    return c.json(answer, 200);
  } catch (error) {
    return answerFailure(c, error);
  }
};
// #endregion answer

// #region negotiate
// Whole or streamed? The customer says so in Accept, the header with the content types it wants to
// receive: with text/event-stream, events; with anything else (application/json, the */* curl
// sends, or none), the whole answer in JSON, as in lesson 1. It's one route that answers in two
// ways, because what's asked for is the same: the assistant's answer. Hono's accepts understands
// the header's weights (text/event-stream;q=0 means "not that").
function wantsStream(c: Context): boolean {
  const format = accepts(c, {
    header: 'Accept',
    supports: ['application/json', 'text/event-stream'],
    default: 'application/json',
  });
  return format === 'text/event-stream';
}
// #endregion negotiate

// #region stream
// The streamed answer (lesson 2). The model's events come in; the shop's go out (events.ts): text
// with each piece, end when it finishes and error if something fails halfway.
async function answerStreaming(
  c: Context,
  client: Anthropic,
  messages: Message[],
  signal: AbortSignal,
) {
  const requestId = c.get('requestId');
  // #region cancel
  // With it, the call to the model is cancelled if the customer leaves halfway. The call gets both
  // signals together (AbortSignal.any): the first one to fire cancels it.
  const cancel = new AbortController();
  const stream = askStreaming(client, messages, AbortSignal.any([cancel.signal, signal]));
  // #endregion cancel
  // #region first-event
  // The model's events are read one by one, with this reader. It's asked for now, before waiting
  // for anything: the events the SDK reads before there's a reader, that reader never sees.
  const events = stream[Symbol.asyncIterator]();

  // Until the first event arrives (message_start), the shop hasn't sent anything to the customer. A
  // failure here (a 429, a 529, the model not answering) is a normal error response, with its
  // status code and its Retry-After, as without streaming.
  let event: IteratorResult<Anthropic.MessageStreamEvent>;
  try {
    event = await events.next();
  } catch (error) {
    return answerFailure(c, error);
  }
  // #endregion first-event

  // From here on the response is a 200 with Content-Type: text/event-stream, and its headers go out
  // now: a failure from now on can't change the status code any more, and goes as an event.
  return streamSSE(c, async (sse) => {
    // The customer leaves (closes the tab, Ctrl + C in curl): the call to the model is cancelled,
    // which throws an error in whoever is reading it (below). If the model has finished, it does
    // nothing.
    sse.onAbort(() => cancel.abort());
    try {
      while (!event.done) {
        const fromShop = shopEvent(event.value);
        if (fromShop !== undefined) await sse.writeSSE(asSSE(fromShop));
        event = await events.next();
      }
      // The whole message, with the tokens and why it stopped. If the stream broke halfway (an
      // error event from the API, a cut), finalMessage() throws that error.
      const message = await stream.finalMessage();
      const answer = modelAnswer(message);
      if (answer.refused) warnRefusal(requestId, message);
      await sse.writeSSE(asSSE({ event: 'end', data: answer }));
    } catch (error) {
      // The customer has left (onAbort saw it, or @hono/node-server in the request's signal):
      // there's nobody to tell, and the log gets one line. If the signal that fired is the time
      // limit's, no: the customer is still there, waiting, and gets the error event.
      if (cancel.signal.aborted || c.req.raw.signal.aborted) {
        log.info({ requestId }, 'the customer left: cancelling the call to the model');
        return;
      }
      await sse.writeSSE(asSSE({ event: 'error', data: midStreamProblem(error, requestId) }));
    }
    // On leaving here, streamSSE closes the response.
  });
}
// #endregion stream

// #region failures
// A failure before sending anything to the customer, with or without streaming: the usual error
// response. If it isn't an API error (a programming mistake in the shop), it goes on its way to
// app.onError, like any other.
function answerFailure(c: Context, error: unknown) {
  const failure = modelFailure(error);
  if (failure === undefined) throw error;
  if (c.req.raw.signal.aborted) {
    // The customer has left, and their signal cancelled the call (APIUserAbortError): it isn't a
    // failure of the model, and the log gets only that. The response, the one below, nobody reads.
    log.info(
      { requestId: c.get('requestId') },
      'the customer left: cancelling the call to the model',
    );
  } else {
    logFailure(error, failure, c.get('requestId'));
  }
  // A 500, the same as any other server failure.
  if (failure.status === 500) return serverFailure(c);
  return problem(c, notAvailable(failure), { 'Retry-After': String(failure.retryAfter) });
}

// A failure with the stream already started: the same problem it would be without streaming, as the
// data of the error event. What isn't an API error can't reach app.onError any more (the response
// has already started): it's logged here, the same way as there, and the customer gets the same
// 500.
function midStreamProblem(error: unknown, requestId: string): Problem {
  const failure = modelFailure(error);
  if (failure === undefined) {
    log.error({ err: error, requestId }, 'uncaught error');
    return serverProblem(requestId);
  }
  logFailure(error, failure, requestId);
  return failure.status === 500 ? serverProblem(requestId) : notAvailable(failure);
}

// To the log. If the API rejected the shop's request, it's an error, with what it said (the status
// code, the type and its message, inside err): none of that reaches the customer. If it's something
// passing, a warning.
function logFailure(error: unknown, failure: Failure, requestId: string) {
  if (failure.status === 500) {
    log.error({ err: error, requestId }, "the model's API rejected the shop's request");
  } else {
    log.warn({ err: error, requestId }, 'the model is not available');
  }
}

// A refusal isn't an error: the customer gets the shop's fixed sentence. The log gets the message id
// and the category the API gives (never the conversation, which is the customer's).
function warnRefusal(requestId: string, message: Anthropic.Message) {
  log.warn(
    { requestId, message: message.id, category: message.stop_details?.category ?? null },
    'the model refused to answer',
  );
}
// #endregion failures

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
