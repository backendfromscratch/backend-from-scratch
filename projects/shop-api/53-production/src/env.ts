// What the middleware leave in each request's context, for the routes that come after. Hono keeps
// it in c.var: c.var.user is the person who has signed in, and c.var.apiKey, the program that has
// identified itself with its API key. If there's nobody, both are undefined.
import type { ApiKey } from './api-keys.ts';
import type { User } from './users.ts';

export interface Env {
  Variables: {
    user?: User;
    apiKey?: ApiKey;
  };
}
