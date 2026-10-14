// What the middleware leave in each request's context, for the routes that come after. Hono keeps
// it in c.var: c.var.user is whoever has signed in, or undefined if nobody.
import type { User } from './users.ts';

export interface Env {
  Variables: {
    user?: User;
  };
}
