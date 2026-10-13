// #region validate
import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { invalidData } from '../problems.ts';

// Checks one part of the request (the JSON body, the path or the query string) against a schema.
// If it doesn't match, it answers 422 with each problem, in the format of all the API's errors,
// and the route never runs.
export const validate = <Schema extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        problem: issue.message,
      }));
      return invalidData(c, errors);
    }
  });
// #endregion validate
