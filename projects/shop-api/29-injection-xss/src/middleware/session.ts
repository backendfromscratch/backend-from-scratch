// The session in each request: where the id comes from, who it is and what happens if nobody's there.
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env.ts';
import { httpProblem } from '../problems.ts';
import { createSession, deleteSession, SESSION_DURATION, sessionUser } from '../sessions.ts';

const COOKIE = 'session';

// #region cookie
// Each of the cookie's attributes (Phase 2) has its reason:
// - HttpOnly: the page's JavaScript can't read it. If someone manages to slip a script into the
//   page (XSS, lesson 6), they don't take the session with them.
// - Secure: it only travels over HTTPS. Current browsers and curl (tested with 8.14) treat
//   http://localhost as secure, so on your computer it works without HTTPS too. With
//   http://127.0.0.1 it doesn't: for the browser it's another site, with its own cookies.
// - SameSite=Lax: if another site makes the browser send a POST here, the cookie doesn't go
//   (lesson 7).
// - Path=/: it's valid for the whole API.
// - Max-Age: the seconds the browser keeps it, the same the session lasts.
const ATTRIBUTES = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

// Creates the session and sends its id in the cookie. If the browser brought another session, it's
// deleted: after signing in, always a new id. Otherwise, someone who had slipped their id into your
// browser before you signed in (session fixation) would have your session as soon as you came in.
export async function openSession(c: Context, userId: number) {
  const previous = sessionId(c);
  if (previous !== undefined) await deleteSession(previous);
  const id = await createSession(userId);
  setCookie(c, COOKIE, id, { ...ATTRIBUTES, maxAge: SESSION_DURATION });
}

// When signing out: the row is deleted and the browser is asked to forget the cookie (Max-Age=0).
export async function closeSession(c: Context) {
  const id = sessionId(c);
  if (id !== undefined) await deleteSession(id);
  deleteCookie(c, COOKIE, ATTRIBUTES);
}
// #endregion cookie

// #region load-session
// The id arrives in the cookie (a browser) or in the Authorization: Bearer <id> header (a program
// that doesn't keep cookies, like a phone app). Both ways say the same: "this is my session".
function sessionId(c: Context): string | undefined {
  return getCookie(c, COOKIE) ?? /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
}

// On every request: if it brings a valid session, it leaves its account in c.var.user. If not,
// it does nothing: deciding whether a route needs a session is requireIdentity's job.
export const loadSession: MiddlewareHandler<Env> = async (c, next) => {
  const id = sessionId(c);
  const user = id === undefined ? undefined : await sessionUser(id);
  if (user) c.set('user', user);
  await next();
};
// #endregion load-session

// #region require-identity
// For the routes that need to know who you are: a person with their session or a program with its
// key. Without either of the two, 401 Unauthorized: "I don't know who you are". A 401 has to say
// in WWW-Authenticate how to identify yourself (RFC 9110): with Bearer, the session or the key are
// valid.
// requirePermission (permissions.ts) also uses it, for the routes that ask for a permission.
export const notIdentified = (c: Context) =>
  httpProblem(c, 401, 'Sign in, or identify yourself with your API key', {
    'WWW-Authenticate': 'Bearer realm="shop-api"',
  });

export const requireIdentity: MiddlewareHandler<Env> = async (c, next) => {
  if (c.var.user === undefined && c.var.apiKey === undefined) return notIdentified(c);
  await next();
};
// #endregion require-identity
