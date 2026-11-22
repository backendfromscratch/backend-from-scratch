// What the shop does when the call to the model fails (Phase 11, lessons 1 and 2). The SDK throws an
// error of a different class for each case (RateLimitError for a 429, OverloadedError for a 529,
// AuthenticationError for a 401…), and here it's decided what the customer sees by looking at the
// class (or, in the middle of a stream, at the error's type), never at the message's text, which
// can change:
//   - 503, with Retry-After: something passing (a 429, a 529, a network cut), fixed by waiting;
//   - 500: the API rejected the shop's request (a 400, a 401, a 404…). The shop did something wrong
//     or is badly configured: it isn't the customer's fault, and it goes to the log.
// They're pure functions: they answer nothing, they only decide. route.ts uses them.
import Anthropic from '@anthropic-ai/sdk';
import { type Problem, problemType } from '../problems.ts';

export type Failure = Passing | { status: 500 };
export type Passing = { status: 503; retryAfter: number; detail: string };

// The seconds suggested to wait when the API doesn't say.
export const DEFAULT_WAIT = 30;

// #region retry-after
// The API's retry-after header (seconds), rounded up. If it isn't there, or isn't a number,
// DEFAULT_WAIT.
export function waitFrom(headers: Headers | undefined): number {
  const seconds = Number(headers?.get('retry-after') ?? '');
  return seconds > 0 ? Math.ceil(seconds) : DEFAULT_WAIT;
}
// #endregion retry-after

// #region model-failure
// undefined: it isn't an API error (a programming mistake in the shop); let it go on its way to
// app.onError, like any other.
export function modelFailure(error: unknown): Failure | undefined {
  // A network cut, or an answer that doesn't arrive in time (APIConnectionTimeoutError is a kind of
  // APIConnectionError). It goes first: in the SDK, APIConnectionError is also an APIError.
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 503, retryAfter: DEFAULT_WAIT, detail: 'The model is not answering' };
  }
  // The call was cancelled (APIUserAbortError, which is also an APIError). In the shop two things
  // cancel it: the customer leaving, and then the route doesn't ask here (there's nobody to answer),
  // or the assistant's time limit (ASSISTANT_TIMEOUT_MS, in config.ts), which is what's left: the
  // model didn't finish in time.
  if (error instanceof Anthropic.APIUserAbortError) {
    return { status: 503, retryAfter: DEFAULT_WAIT, detail: 'The model is not answering' };
  }
  // 429: the shop's account has made too many requests (or, according to the docs, reached its tier's
  // spend cap; the spend limit you set in the Console gives a 400, which ends up as a 500 here). The
  // limit is the shop's, not the customer's: that's why the customer gets a 503, not a 429.
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 503,
      retryAfter: waitFrom(error.headers),
      detail: 'The model is getting too many requests from the shop',
    };
  }
  // 529 (overloaded, OverloadedError) and any other 5xx: a problem of the API's, which usually goes
  // away on its own.
  if (error instanceof Anthropic.InternalServerError) {
    return { status: 503, retryAfter: waitFrom(error.headers), detail: 'The model is overloaded' };
  }
  // An error in the middle of a stream (lesson 2): the API had already answered 200 and was sending
  // events, and it sends one of type error. There's no status code any more (status is undefined):
  // what happened is in error.type, the same type a 429's, a 529's or a 500's body would carry.
  if (error instanceof Anthropic.APIError && error.status === undefined) {
    const detail = PASSING_MID_STREAM[error.type ?? ''];
    if (detail !== undefined) return { status: 503, retryAfter: DEFAULT_WAIT, detail };
  }
  // Any other error response from the API: 400 (a badly made request), 401 (the key isn't valid),
  // 403, 404 (a model that doesn't exist)…
  if (error instanceof Anthropic.APIError) return { status: 500 };
  // A network cut in the middle of a stream: the response was already a 200, so the SDK doesn't
  // throw it as an APIConnectionError, but as an AnthropicError with the network error inside, in
  // cause.
  if (error instanceof Anthropic.AnthropicError && error.cause !== undefined) {
    return { status: 503, retryAfter: DEFAULT_WAIT, detail: 'The model is not answering' };
  }
  return undefined;
}

// The error types that, in the middle of a stream, are something passing.
const PASSING_MID_STREAM: Record<string, string> = {
  rate_limit_error: 'The model is getting too many requests from the shop',
  overloaded_error: 'The model is overloaded',
  api_error: 'The model is overloaded',
};
// #endregion model-failure

// #region not-available
// The problem the customer sees when the failure is passing: the same with and without streaming.
// It goes as the body of a 503 or, if the stream had already started, as the data of the error
// event (events.ts).
export function notAvailable(failure: Passing): Problem & { status: 503 } {
  return {
    type: problemType('assistant-not-available'),
    title: 'The assistant is not available right now',
    status: 503,
    detail: `${failure.detail}: try again in ${failure.retryAfter} seconds`,
  };
}
// #endregion not-available
