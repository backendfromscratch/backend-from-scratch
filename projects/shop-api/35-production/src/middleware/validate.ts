import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { invalidData } from '../problems.ts';

// #region if-invalid
// From Zod's error, only the list of issues is needed: where each one is and what's wrong with it.
interface Result {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}

// What's answered when a part of the request doesn't match its schema: 422, with each problem.
// validate (in v1) and v2's contract (defaultHook, in v2.ts) use it.
export function ifInvalid(result: Result, c: Context) {
  if (!result.success && result.error) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      problem: issue.message,
    }));
    return invalidData(c, errors);
  }
}
// #endregion if-invalid

// Checks one part of the request (the JSON body, the path or the query string) against a schema.
export const validate = <Schema extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
) => zValidator(target, schema, ifInvalid);
