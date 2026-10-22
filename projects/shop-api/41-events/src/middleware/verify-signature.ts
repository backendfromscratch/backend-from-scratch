// #region verify-signature
import type { MiddlewareHandler } from 'hono';
import { config } from '../config.ts';
import { problem, problemType } from '../problems.ts';
import { validSignature } from '../signature.ts';

// It checks the signature before anything else: with the body as text, byte by byte as it came.
// If it were read as JSON and written again, one extra space would change the signature. If it's
// not valid, 400 and not 401: a 401 requires WWW-Authenticate, which says how to identify
// yourself, and a signature has no such scheme.
export const verifySignature: MiddlewareHandler = async (c, next) => {
  const body = await c.req.text();
  if (!validSignature(body, c.req.header('X-Signature'), config.WEBHOOK_SECRET)) {
    return problem(c, {
      type: problemType('invalid-signature'),
      title: 'The signature is not valid',
      status: 400,
      detail: 'The X-Signature header does not match this body',
    });
  }
  await next();
};
// #endregion verify-signature
