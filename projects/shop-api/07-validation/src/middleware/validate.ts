// #region validate
import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

// Checks one part of the request (the JSON body, the path or the query string) against a schema.
// If it doesn't match, it answers 422 with each problem and the route never runs: the server could
// read the request, but the data makes no sense (Phase 2, lesson 3).
export const validate = <Schema extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        problem: issue.message,
      }));
      return c.json({ error: 'The data is not valid', details }, 422);
    }
  });
// #endregion validate
