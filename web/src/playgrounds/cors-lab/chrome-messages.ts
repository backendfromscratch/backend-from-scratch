/**
 * Chrome's console messages for each CORS failure, word for word. Chrome writes them in English
 * whatever the browser's language. Captured from Playwright's Chromium 153 on 2026-10-13
 * with a local server answering each case; chrome-messages.test.ts keeps the captured lines.
 */
import type { FailureDetail } from './cors';

const preflightPrefix = "Response to preflight request doesn't pass access control check: ";

function reason({ failure, method, header, value }: FailureDetail): string {
  switch (failure) {
    case 'origin-absent':
      return "No 'Access-Control-Allow-Origin' header is present on the requested resource.";
    case 'origin-wildcard':
      return "The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.";
    case 'origin-mismatch':
      return `The 'Access-Control-Allow-Origin' header has a value '${value}' that is not equal to the supplied origin. Have the server send the header with a valid value.`;
    case 'credentials':
      return "The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.";
    case 'status':
      return 'It does not have HTTP ok status.';
    case 'method':
      return `Method ${method} is not allowed by Access-Control-Allow-Methods in preflight response.`;
    case 'header':
      return `Request header field ${header} is not allowed by Access-Control-Allow-Headers in preflight response.`;
  }
}

/** The method and header failures are only about the preflight, and Chrome says so in them. */
const namesThePreflight = (failure: FailureDetail) =>
  failure.failure === 'method' || failure.failure === 'header';

/** The line Chrome writes in the console for this failure of a `fetch` from `origin` to `url`. */
export function chromeMessage(failure: FailureDetail, url: string, origin: string): string {
  const prefix = failure.preflight && !namesThePreflight(failure) ? preflightPrefix : '';
  return `Access to fetch at '${url}' from origin '${origin}' has been blocked by CORS policy: ${prefix}${reason(failure)}`;
}

/** What the page's JavaScript gets: `fetch` rejects with this error, whatever the cause. */
export const fetchError = 'TypeError: Failed to fetch';
