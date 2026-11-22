// POST /v2/assistant (Phase 11, lessons 1 to 3, 6 and 7): the customer sends the conversation, the shop
// passes it to the model with its instructions and its tools, runs the ones it asks for (loop.ts)
// and returns the answer, the tokens it cost and, since lesson 6, the sections of the help it cites
// (sources). Since lesson 7, every call to the model goes to the log with what it cost, to the
// metrics and to the customer's budget. Whole, in JSON, or, if the customer asks for it
// streamed (Accept: text/event-stream), piece by piece, as the model writes it. The route, with what
// it receives and what it answers, is in the contract (contract.ts and schemas.ts), like the rest of
// v2; requirePermission('assistant:use') has already checked it's a customer with their session,
// and OpenAPIHono, that the conversation matches the schema. v2.ts registers it.
import type Anthropic from '@anthropic-ai/sdk';
import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { accepts } from 'hono/accepts';
import { streamSSE } from 'hono/streaming';
import { config } from '../config.ts';
import type * as contract from '../contract.ts';
import type { Env } from '../env.ts';
import { log } from '../log.ts';
import { metrics } from '../metrics.ts';
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
import { budget, budgetExhausted, budgetUnchecked, BudgetUnavailable } from './budget.ts';
import { ask, askStreaming, client } from './client.ts';
import {
  apiMessages,
  type Message,
  modelAnswer,
  SEPARATOR,
  UNFINISHED_TEXT,
} from './conversation.ts';
import { recordCall, tokensOf } from './cost.ts';
import { type Failure, modelFailure, notAvailable } from './errors.ts';
import { type AssistantEvent, asSSE, shopEvent, toolEvent } from './events.ts';
import { converse, MAX_ROUNDS, type Result, type Steps } from './loop.ts';
import { labelOf, runTool } from './tools/index.ts';
import type { RunAs, Source } from './tools/tool.ts';

// Without ANTHROPIC_API_KEY: the shop works, but it has no assistant. No Retry-After: waiting won't
// fix it. Since lesson 7 the route that requests descriptions uses it too (v2.ts).
export const noAssistant = (c: Context) =>
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
  // And, since lesson 7, the customer's token budget for today (budget.ts). It goes after the
  // limits on purpose: they use the same Redis, and if it freezes, the limits notice first and stop
  // asking it (rate-limits.ts), instead of every request waiting here.
  const noBudget = await checkBudget(c);
  if (noBudget !== undefined) return noBudget;
  const { messages } = c.req.valid('json');
  // #region who
  // The tools work for the session's customer (tools/tool.ts): a customer, because
  // requirePermission('assistant:use') only lets customers through, and a customer is always a
  // person with their session.
  const runAs: RunAs = { customerId: c.var.user!.id };
  // #endregion who
  // #region deadline-and-signal
  // The time limit for the whole answer, with all its rounds (config.ts): when it's up, this signal
  // cancels the call to the model that's under way, or the next one.
  const deadline = AbortSignal.timeout(config.ASSISTANT_TIMEOUT_MS);
  // And the signal of the customer's request, c.req.raw.signal: @hono/node-server aborts it if the
  // connection closes before the response has gone out (the customer closes the tab, Ctrl + C in
  // curl). The call to the model gets both together (AbortSignal.any), and the first one to fire
  // cancels it: that way the shop doesn't keep waiting, and paying, for an answer nobody will read.
  const signal = AbortSignal.any([deadline, c.req.raw.signal]);
  // #endregion deadline-and-signal
  if (wantsStream(c)) return answerStreaming(c, client, messages, runAs, signal);
  const requestId = c.get('requestId');
  // The sections of the help the model reads (lesson 6): runTool notes here what search_help
  // returns, in every round. The answer's sources, the ones it cites.
  const read: Source[] = [];
  try {
    const steps = wholeSteps(client, runAs, signal, requestId, read);
    const result = await converse(apiMessages(messages), steps);
    return c.json(answerAndWarnings(requestId, result, read), 200);
  } catch (error) {
    return answerFailure(c, error);
  }
};

// What the loop (loop.ts) needs for the whole answer: each round is a messages.create(), and each
// tool runs for the session's customer.
function wholeSteps(
  client: Anthropic,
  runAs: RunAs,
  signal: AbortSignal,
  requestId: string,
  read: Source[],
): Steps {
  return {
    // Each round, and after it, what it cost (countCall, below). If the call is cut (the customer
    // leaves, the time runs out), there's no answer, and the shop doesn't know what it spent.
    ask: async (conversation) => {
      const message = await ask(client, conversation, signal);
      await countCall(message, runAs, requestId);
      return message;
    },
    run: (call) => runTool(call, runAs, requestId, read),
  };
}
// #endregion answer

// #region count
// After every call to the model (lesson 7): the tokens and the cost, to the log and the metrics
// (cost.ts), and the tokens, to the customer's budget (budget.ts). If Redis doesn't answer, the
// budget is left without them, with a warning in the log: the answer is already paid for.
async function countCall(message: Anthropic.Message, runAs: RunAs, requestId: string) {
  const usage = recordCall(message, { requestId });
  await budget.charge(runAs.customerId, tokensOf(usage), { requestId });
}
// #endregion count

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
// A streamed round, already open: the call, whoever reads its events one by one, and the first one.
interface OpenRound {
  stream: ReturnType<typeof askStreaming>;
  events: AsyncIterator<Anthropic.MessageStreamEvent>;
  event: IteratorResult<Anthropic.MessageStreamEvent>;
}

// Opens a round and waits for its first event (message_start): if the API answers an error (a 429,
// a 529) or doesn't answer, it comes out here. The reader is asked for now, before waiting for
// anything: the events the SDK reads before there's a reader, that reader never sees.
async function openRound(
  client: Anthropic,
  conversation: Anthropic.MessageParam[],
  signal: AbortSignal,
): Promise<OpenRound> {
  const stream = askStreaming(client, conversation, signal);
  const events = stream[Symbol.asyncIterator]();
  return { stream, events, event: await events.next() };
}

// The streamed answer (lessons 2 and 3). The model's events come in; the shop's go out (events.ts):
// text with each piece, tool with each call, end when it finishes and error if something fails
// halfway. With tools, an answer is several rounds, and each one is a streamed call to the model:
// the customer sees the text of all of them, one after the other.
async function answerStreaming(
  c: Context,
  client: Anthropic,
  messages: Message[],
  runAs: RunAs,
  signal: AbortSignal,
) {
  const requestId = c.get('requestId');
  // With it, the call to the model is cancelled if the customer leaves halfway. Each call gets both
  // signals together (AbortSignal.any): the first one to fire cancels it.
  const cancel = new AbortController();
  const streamSignal = AbortSignal.any([cancel.signal, signal]);
  const start = apiMessages(messages);
  // The sections the model reads, as without streaming: the sources, the ones it cites, go in end.
  const read: Source[] = [];

  // From here the time to first token counts (lesson 7): the shop starts asking the model.
  // performance.now() measures in milliseconds with decimals, and doesn't jump if someone changes
  // the system's clock, as Date.now() could.
  const started = performance.now();

  // Until the first event of the first round arrives, the shop hasn't sent anything to the
  // customer. A failure here (a 429, a 529, the model not answering) is a normal error response,
  // with its status code and its Retry-After, as without streaming.
  let open: OpenRound | undefined;
  try {
    open = await openRound(client, start, streamSignal);
  } catch (error) {
    return answerFailure(c, error);
  }

  // From here on the response is a 200 with Content-Type: text/event-stream, and its headers go out
  // now: a failure from now on can't change the status code any more, and goes as an event.
  return streamSSE(c, async (sse) => {
    // The customer leaves (closes the tab, Ctrl + C in curl): the call to the model is cancelled,
    // which throws an error in whoever is reading it (below). If the answer has finished, it does
    // nothing.
    sse.onAbort(() => cancel.abort());
    const send = (event: AssistantEvent) => sse.writeSSE(asSSE(event));

    // The pieces of text, to the customer. The first one of a round, if there was already text from
    // another, goes after a blank line (SEPARATOR), as in the whole answer (modelAnswer): that way
    // the text events, together, are still the answer.
    let anyText = false;
    let newRound = true;
    const sendText = async (text: string) => {
      if (newRound && anyText) await send({ event: 'text', data: { text: SEPARATOR } });
      newRound = false;
      anyText = true;
      await send({ event: 'text', data: { text } });
    };

    // The model's first piece of text (not the fixed sentence of UNFINISHED_TEXT): the time it took,
    // to the histogram in metrics.ts.
    let firstText = true;
    const measureFirstToken = () => {
      if (!firstText) return;
      firstText = false;
      const seconds = (performance.now() - started) / 1000;
      metrics.aiTimeToFirstToken.record(seconds, { model: config.MODEL });
    };

    const steps: Steps = {
      // Each round: the first one is already open (with this same conversation); the others are
      // opened here. Their pieces of text go out as they arrive, and at the end, the whole message.
      ask: async (conversation) => {
        const round = open ?? (await openRound(client, conversation, streamSignal));
        open = undefined;
        newRound = true;
        let message: Anthropic.Message;
        try {
          for (let event = round.event; !event.done; event = await round.events.next()) {
            const fromShop = shopEvent(event.value);
            if (fromShop?.event === 'text') {
              measureFirstToken();
              await sendText(fromShop.data.text);
            }
          }
          // If the stream broke halfway (an error event from the API, a cut), it throws that error.
          message = await round.stream.finalMessage();
        } catch (error) {
          // Cut halfway (the customer leaves, a cut, the time limit): the API already charges for what
          // the model has read, and whatever it has written. What is known is in currentMessage, the
          // message as it was going: the input, whole from the first event (message_start); the
          // output, only if it reached message_delta. That is what's counted: without this, whoever
          // opens streams and closes them at once would ask for free as far as their budget goes.
          const halfway = round.stream.currentMessage;
          if (halfway !== undefined) await countCall(halfway, runAs, requestId);
          throw error;
        }
        await countCall(message, runAs, requestId);
        return message;
      },
      run: (call) => runTool(call, runAs, requestId, read),
      // Before each tool runs, the customer knows what the assistant is doing.
      onUse: (call) => send(toolEvent(call, labelOf(call.name))),
    };

    try {
      const result = await converse(start, steps);
      if (result.exhausted) {
        newRound = true;
        await sendText(UNFINISHED_TEXT);
      }
      await send({ event: 'end', data: answerAndWarnings(requestId, result, read) });
    } catch (error) {
      // The customer has left (onAbort saw it, or @hono/node-server in the request's signal):
      // there's nobody to tell, and the log gets one line. If the signal that fired is the time
      // limit's, no: the customer is still there, waiting, and gets the error event.
      if (cancel.signal.aborted || c.req.raw.signal.aborted) {
        log.info({ requestId }, 'the customer left: cancelling the call to the model');
        return;
      }
      await send({ event: 'error', data: midStreamProblem(error, requestId) });
    }
    // On leaving here, streamSSE closes the response.
  });
}
// #endregion stream

// #region failures
// The answer, with or without streaming, and what goes to the log. A refusal isn't an error: the
// customer gets the shop's fixed sentence. The log gets the message id and the category the API
// gives (never the conversation, which is the customer's). And if the model reached the maximum
// of rounds asking for tools, a warning: it may be a model going round in circles, or someone
// trying to make it go round.
function answerAndWarnings(requestId: string, result: Result, read: Source[]) {
  const answer = modelAnswer(result, read);
  const last = result.messages.at(-1)!;
  if (answer.refused) {
    log.warn(
      { requestId, message: last.id, category: last.stop_details?.category ?? null },
      'the model refused to answer',
    );
  }
  if (result.exhausted) {
    log.warn(
      { requestId, message: last.id, rounds: MAX_ROUNDS },
      'the assistant reached the maximum of rounds without finishing',
    );
  }
  return answer;
}

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

// #region check-budget
// The customer's budget for today (lesson 7). If they've already spent it, 429 with Retry-After
// until midnight (UTC); if Redis doesn't answer, 503 (it closes). It returns that error response,
// or undefined if they still have some left.
async function checkBudget(c: Context<Env>) {
  try {
    const status = await budget.check(c.var.user!.id);
    return status.allowed ? undefined : budgetExhausted(c, status);
  } catch (error) {
    if (error instanceof BudgetUnavailable) {
      log.warn({ requestId: c.get('requestId'), reason: error.message }, 'budget unchecked');
      return budgetUnchecked(c);
    }
    throw error;
  }
}
// #endregion check-budget
