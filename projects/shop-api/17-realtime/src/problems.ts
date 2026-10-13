// The API's errors, all with the same shape: the one in RFC 9457, "Problem Details for HTTP
// APIs". A client that can read one can read them all.
import { STATUS_CODES } from 'node:http';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// #region problem
export interface FieldError {
  field: string;
  problem: string;
}

export interface Problem {
  type: string; // what kind of problem it is: a URI, always the same for the same kind
  title: string; // the summary of that kind, the same every time
  status: ContentfulStatusCode; // the status code, in the body too
  detail?: string; // what happened this time
  instance?: string; // which of the times: an identifier for this case
  errors?: FieldError[]; // an extension of ours: what's wrong in each field
}

// The body is JSON, but with its own content type: application/problem+json. That way the client
// knows, before reading it, that it's an error with this shape. Code is the exact status code (404,
// 422…): that way TypeScript can check that the route has it in its contract (lesson 5).
export function problem<Code extends ContentfulStatusCode>(
  c: Context,
  data: Problem & { status: Code },
  headers: Record<string, string> = {},
) {
  return c.json(data, data.status, { 'Content-Type': 'application/problem+json', ...headers });
}
// #endregion problem

// #region http-problem
// When the status code already says it all (404, 405…): type is about:blank and title, that
// code's phrase (Node has them in STATUS_CODES: 404 is "Not Found"). detail tells the case.
export function httpProblem<Code extends ContentfulStatusCode>(
  c: Context,
  status: Code,
  detail: string,
  headers: Record<string, string> = {},
) {
  const title = STATUS_CODES[status] ?? 'Error';
  return problem(c, { type: 'about:blank', title, status, detail }, headers);
}
// #endregion http-problem

// #region types
// The shop's own types, with a URI on its domain. It doesn't have to open, but it's best if it
// leads to a page that explains the problem and how to avoid it.
export const problemType = (name: string) => `https://shop.example/problems/${name}`;

// The data doesn't match the schema, or asks for something that doesn't exist: 422, with each
// field that fails.
export function invalidData(c: Context, errors: FieldError[]) {
  return problem(c, {
    type: problemType('invalid-data'),
    title: 'The data is not valid',
    status: 422,
    detail: 'See "errors" for what is wrong with each field.',
    errors,
  });
}
// #endregion types
