// The Idempotency-Key header: the client gives each operation a unique key and, if it repeats it
// (because the response didn't arrive and it retries), it gets the same response instead of
// creating another one. It's common practice (Stripe, for example), described in an IETF draft
// that isn't a standard yet.
import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { problem, problemType } from '../problems.ts';

// #region stored
// What was answered to each key. In memory, like the data; in production it would go to the
// database (Phase 5), and each key would expire after a day.
interface StoredResponse {
  requestBody: string;
  status: ContentfulStatusCode;
  body: string;
  location: string | null;
}

const stored = new Map<string, StoredResponse>();
// #endregion stored

// #region idempotency-replay
export const idempotency: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('Idempotency-Key');
  if (key === undefined) return next(); // without a key, as always

  const requestBody = await c.req.text();
  const saved = stored.get(key);
  if (saved && saved.requestBody !== requestBody) {
    return problem(c, {
      type: problemType('reused-key'),
      title: 'That key was already used with other data',
      status: 422,
      detail: 'Use a new Idempotency-Key for each different operation',
    });
  }
  if (saved) {
    // The same request again: the same response, without doing anything again. c.header and
    // c.body build it on this request's response, which already has its own X-Request-Id: it's
    // another request.
    c.header('Content-Type', 'application/json');
    if (saved.location) c.header('Location', saved.location);
    c.header('Idempotent-Replayed', 'true');
    return c.body(saved.body, saved.status);
  }
  // #endregion idempotency-replay

  // #region idempotency-store
  await next();
  // Only what went well is stored: if it failed, the client can fix it and retry.
  if (c.res.ok) {
    const body = await c.res.clone().text();
    const location = c.res.headers.get('Location');
    // ok is a 2xx with a body, like 201: the as promises it to TypeScript, which sees a number.
    const status = c.res.status as ContentfulStatusCode;
    stored.set(key, { requestBody, status, body, location });
  }
  // #endregion idempotency-store
};
