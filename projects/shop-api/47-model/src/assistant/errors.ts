// What the shop does when the call to the model fails (Phase 11, lesson 1). The SDK throws an error
// of a different class for each case (RateLimitError for a 429, OverloadedError for a 529,
// AuthenticationError for a 401…), and here it's decided what the customer sees by looking at the
// class, never at the message's text, which can change:
//   - 503, with Retry-After: something passing (a 429, a 529, a network cut), fixed by waiting;
//   - 500: the API rejected the shop's request (a 400, a 401, a 404…). The shop did something wrong
//     or is badly configured: it isn't the customer's fault, and it goes to the log.
// It's a pure function: it answers nothing, it only decides. route.ts uses it.
import Anthropic from '@anthropic-ai/sdk';

export type Failure = { status: 503; retryAfter: number; detail: string } | { status: 500 };

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
  // The call was cancelled (APIUserAbortError, which is also an APIError). In the shop only the
  // assistant's time limit cancels it (ASSISTANT_TIMEOUT_MS, in config.ts): the model didn't finish
  // in time.
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
  // Any other error response from the API: 400 (a badly made request), 401 (the key isn't valid),
  // 403, 404 (a model that doesn't exist)…
  if (error instanceof Anthropic.APIError) return { status: 500 };
  return undefined;
}
// #endregion model-failure
