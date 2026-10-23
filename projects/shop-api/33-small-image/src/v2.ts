// Version 2 of the API: prices in whole cents (priceCents). Each route comes from its definition
// in the contract (contract.ts): OpenAPIHono validates the request with its schemas and writes the
// route down in the documentation.
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { config } from './config.ts';
import * as contract from './contract.ts';
import {
  cancelOrder,
  changeQuantity,
  changeStatus,
  createOrder,
  createProduct,
  deleteProduct,
  findOrder,
  findProduct,
  listProducts,
  orderChanges,
  recordEvent,
  type Order,
} from './data.ts';
import type { Env } from './env.ts';
import {
  ipOf,
  type Limiter,
  limits,
  setHeaders,
  type State,
  tooManyAttempts,
} from './rate-limits.ts';
import { closeSession, openSession } from './middleware/session.ts';
import { ifInvalid } from './middleware/validate.ts';
import { notifyPayment, saveNotification } from './notifications.ts';
import { nextLink, pageByCursor, pageByOffset } from './pagination.ts';
import { can, type Permission } from './permissions.ts';
import { httpProblem, invalidData, problem, problemType } from './problems.ts';
import { finishSignIn, type SavedStart, startSignIn } from './provider.ts';
import { checkUrl } from './safe-url.ts';
import { checkCredentials, createUser, userFromProvider } from './users.ts';

// defaultHook: what's answered if the request doesn't match the schema. The same 422 as always.
// Env: what the middleware leave in c.var (who has signed in).
export const v2 = new OpenAPIHono<Env>({ defaultHook: ifInvalid });

// How the token is sent, for the documentation: Authorization: Bearer <token>. The token is an
// API key or a session's id.
v2.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
});

// And the session, which travels in the "session" cookie.
v2.openAPIRegistry.registerComponent('securitySchemes', 'Session', {
  type: 'apiKey',
  in: 'cookie',
  name: 'session',
});

// PostgreSQL already does the filter and the sort (data.ts): it only returns the products that match.
v2.openapi(contract.listProducts, async (c) => {
  return c.json(await listProducts(c.req.valid('query')), 200);
});

// TypeScript checks each response against the contract: a 404 that wasn't in it, or a c.json
// without the status code, wouldn't compile.
v2.openapi(contract.getProduct, async (c) => {
  const product = await findProduct(c.req.valid('param').id);
  if (!product) return httpProblem(c, 404, 'No such product');
  return c.json(product, 200);
});

v2.openapi(contract.createProduct, async (c) => {
  const { name, priceCents } = c.req.valid('json');
  const product = await createProduct(name, priceCents);
  return c.json(product, 201, { Location: `${c.req.path}/${product.id}` });
});

// If the product has orders, deleteProduct throws a PostgreSQL error and onError (app.ts)
// answers a 409.
v2.openapi(contract.deleteProduct, async (c) => {
  if (!(await deleteProduct(c.req.valid('param').id))) {
    return httpProblem(c, 404, 'No such product');
  }
  return c.body(null, 204);
});

// #region list-orders
// A page of orders, from newest to oldest. If there are more, the Link header says where the next
// one is. ?offset= stays to compare the two ways of paginating.
// #region only-their-own
// A breaking change, on purpose and without warning: until lesson 5, anyone could see all the
// orders of all the customers. A change like this used to be announced first (Deprecation and
// Sunset, Phase 4), but this was a security hole: it's closed as soon as it's seen, in /v1 too.
// The convenience of whoever used the API never weighs more than the customers' data.
v2.openapi(contract.listOrders, async (c) => {
  const { limit, cursor, offset, status } = c.req.valid('query');
  // With orders:view-all, all of them; if not (a customer, with view-own), only their account's.
  const customerId = can(c, 'orders:view-all') ? undefined : c.var.user!.id;
  // #endregion only-their-own

  if (offset !== undefined) {
    const { page, next } = await pageByOffset(limit, offset, status, customerId);
    if (next !== undefined) {
      c.header('Link', nextLink(c.req.url, 'offset', String(next)));
    }
    return c.json(page, 200);
  }

  const { page, next } = await pageByCursor(limit, cursor, status, customerId);
  if (next !== undefined) c.header('Link', nextLink(c.req.url, 'cursor', next));
  return c.json(page, 200);
});
// #endregion list-orders

// #region visible-order
// An order, if whoever asks can see it or change it: with the "all" permission, any; if not, only
// one of their own. It's the check most APIs forget (BOLA, the first in the OWASP API Top 10):
// asking for /v2/orders/7, then 8, 9… and seeing other people's. If it isn't theirs, the route
// answers 404, as if it didn't exist: a 403 would tell them that order exists.
async function visibleOrder(c: Context<Env>, id: number, all: Permission) {
  const order = await findOrder(id);
  if (order === undefined) return undefined;
  if (can(c, all) || order.customerId === c.var.user?.id) return order;
  return undefined;
}

v2.openapi(contract.getOrder, async (c) => {
  const order = await visibleOrder(c, c.req.valid('param').id, 'orders:view-all');
  if (!order) return httpProblem(c, 404, 'No such order');
  return c.json(order, 200);
});
// #endregion visible-order

// #region create-order
// A product that doesn't exist is invalid data: the same 422 as validation, with the field.
// If there isn't enough stock left, 409: the request is fine, but it clashes with what's in the shop.
// The order belongs to whoever has signed in: requirePermission('orders:create') only lets a
// customer through, and a customer is always a person.
v2.openapi(contract.createOrder, async (c) => {
  const { productId, quantity } = c.req.valid('json');
  const result = await createOrder(productId, quantity, c.var.user!.id);
  if ('error' in result) {
    if (result.error === 'not-found') {
      return invalidData(c, [{ field: 'productId', problem: 'No such product' }]);
    }
    return problem(c, {
      type: problemType('out-of-stock'),
      title: 'Not enough stock left',
      status: 409,
      detail: `You ask for ${quantity} and ${result.left} are left`,
    });
  }
  const { order } = result;
  return c.json(order, 201, { Location: `${c.req.path}/${order.id}` });
});
// #endregion create-order

// A type of the shop's own: the request is well written, but the order's status doesn't allow it.
// title is always the same; detail says what's going on with this order.
function statusDoesNotAllow(c: Context, detail: string) {
  return problem(c, {
    type: problemType('order-status'),
    title: "The order's status doesn't allow it",
    status: 409,
    detail,
  });
}

v2.openapi(contract.changeOrder, async (c) => {
  const order = await visibleOrder(c, c.req.valid('param').id, 'orders:change-all');
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status !== 'pending') {
    return statusDoesNotAllow(c, `The order is ${order.status}: it can no longer be changed`);
  }
  // Asking for more units takes stock, and asking for fewer gives it back (data.ts). detail has the
  // units asked for on top of the current ones, not the new quantity: those are the ones that would
  // have to be in stock.
  const result = await changeQuantity(order.id, c.req.valid('json').quantity);
  if ('error' in result) {
    if (result.error === 'status') {
      return statusDoesNotAllow(c, `The order is ${result.status}: it can no longer be changed`);
    }
    return problem(c, {
      type: problemType('out-of-stock'),
      title: 'Not enough stock left',
      status: 409,
      detail: `You ask for ${result.more} more and ${result.left} are left`,
    });
  }
  return c.json(result.order, 200);
});

v2.openapi(contract.cancelOrder, async (c) => {
  const order = await visibleOrder(c, c.req.valid('param').id, 'orders:change-all');
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status === 'shipped') {
    return statusDoesNotAllow(c, 'The order is already shipped: it cannot be cancelled');
  }
  // Cancelling gives the stock back (data.ts). cancelOrder only cancels a pending or paid order: if
  // it was shipped in the meantime, it returns the order unchanged, and the response is the same 409.
  const cancelled = await cancelOrder(order.id);
  if (cancelled.status !== 'cancelled') {
    return statusDoesNotAllow(
      c,
      `The order is already ${cancelled.status}: it cannot be cancelled`,
    );
  }
  return c.json(cancelled, 200);
});

// #region ship-order
// Only a paid order is shipped. Whoever asks (delivery or admin) can see all the orders.
v2.openapi(contract.shipOrder, async (c) => {
  const order = await findOrder(c.req.valid('param').id);
  if (!order) return httpProblem(c, 404, 'No such order');
  if (order.status !== 'paid') {
    return statusDoesNotAllow(c, `The order is ${order.status}: only a paid one is shipped`);
  }
  // Only if it is still paid, in the same UPDATE: if it was cancelled in the meantime, the same 409.
  const shipped = await changeStatus(order.id, 'shipped', 'paid');
  if (!shipped) {
    const now = (await findOrder(order.id))!;
    return statusDoesNotAllow(c, `The order is ${now.status}: only a paid one is shipped`);
  }
  return c.json(shipped, 200);
});
// #endregion ship-order

// By the time it gets here, the signature is already checked and the event matches its schema.
// The response has to be quick: if the gateway doesn't get a 2xx in time, it retries. That's why,
// if the work were long (an email, an invoice), it would be left for later (a queue, Phase 9).
v2.openapi(contract.receivePayment, async (c) => {
  const event = c.req.valid('json');
  const order = await findOrder(event.orderId);
  if (!order) {
    return invalidData(c, [{ field: 'orderId', problem: 'No such order' }]);
  }
  // The same event again: receipt is acknowledged and nothing else is done.
  if (!(await recordEvent(event.id))) {
    return c.json({ received: event.id, repeated: true }, 200);
  }
  // Only a pending order becomes paid: a cancelled one stays cancelled. The check is in the same
  // UPDATE (from 'pending'): if a cancellation arrives just before, it isn't paid.
  const paid = await changeStatus(order.id, 'paid', 'pending');
  if (paid) {
    // The notification to the delivery company (lesson 7), without waiting for it: the gateway needs
    // its response now, and a notification that takes long or fails mustn't change it. If it fails,
    // it stays in the log.
    void notifyPayment(paid);
  }
  return c.json({ received: event.id, repeated: false }, 200);
});

// #region follow-order
// The response starts and doesn't end: each event is one more piece of the same response. First,
// the current status; after that, each change. If the connection drops, EventSource reconnects on
// its own and gets the current status again: nothing is lost.
// The same rule as for seeing an order: yours, or any with orders:view-all.
v2.openapi(contract.followOrder, async (c) => {
  const order = await visibleOrder(c, c.req.valid('param').id, 'orders:view-all');
  if (!order) return httpProblem(c, 404, 'No such order');

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'status', data: JSON.stringify(order) });
    const notify = async (changed: Order) => {
      if (changed.id !== order.id) return;
      await stream.writeSSE({ event: 'status', data: JSON.stringify(changed) });
    };
    orderChanges.on('change', notify);
    // It waits until the client leaves; then it stops listening.
    await new Promise<void>((left) => stream.onAbort(left));
    orderChanges.off('change', notify);
  });
});
// #endregion follow-order

// #region create-account
// By the time it gets here, the email has the shape of an email and the password meets the rules
// (the schema). The response carries the id and the email: the hash never leaves the database.
v2.openapi(contract.createAccount, async (c) => {
  // At most, 5 accounts per hour from the same IP (rate-limits.ts): every attempt counts.
  const ip = ipOf(c);
  const state = await limits.accountsByIp.check(ip);
  if (!state.allowed) return tooManyAttempts(c, [[limits.accountsByIp, state]]);
  await limits.accountsByIp.record(ip);
  setHeaders(c, [[limits.accountsByIp, await limits.accountsByIp.check(ip)]]);

  const { email, password } = c.req.valid('json');
  const result = await createUser(email, password);
  if ('error' in result) {
    // Saying "that email already has an account" tells anyone who is a customer of the shop. To
    // not say it, the response would always be the same and the shop would send an email to the
    // address; there's no email here, so it's said, and lesson 8 limits how many times you can ask.
    return problem(c, {
      type: problemType('email-taken'),
      title: 'There is already an account with that email',
      status: 409,
      detail: 'If it is yours, sign in with it',
    });
  }
  const { user } = result;
  // The new account's URL. The API doesn't have a route to read it yet: each person will see
  // theirs at /v2/me (lesson 2).
  return c.json(user, 201, { Location: `${c.req.path}/${user.id}` });
});
// #endregion create-account

// #region sign-in
// The same 400, with the same body, for an email that doesn't exist and for a wrong password:
// whoever tries doesn't know which of the two has failed, nor whether that email has an account.
// The limits (lesson 8), before anything else: with too many failures, 429, and the password isn't
// even looked at. That way, not even the right one gets in while the block lasts: whoever tries
// doesn't know whether they guessed it.
async function checkSignInLimits(email: string, ip: string) {
  const checked: [Limiter, State][] = [
    [limits.signInByEmail, await limits.signInByEmail.check(email)],
    [limits.signInByIp, await limits.signInByIp.check(ip)],
  ];
  return checked;
}

v2.openapi(contract.signIn, async (c) => {
  const { email, password } = c.req.valid('json');
  const byEmail = email.toLowerCase();
  const ip = ipOf(c);
  const before = await checkSignInLimits(byEmail, ip);
  if (before.some(([, state]) => !state.allowed)) return tooManyAttempts(c, before);

  const user = await checkCredentials(email, password);
  if (!user) {
    // One more failure, in both counts: that email's and that IP's.
    await limits.signInByEmail.record(byEmail);
    await limits.signInByIp.record(ip);
    setHeaders(c, await checkSignInLimits(byEmail, ip));
    return problem(c, {
      type: problemType('invalid-credentials'),
      title: 'The email or the password is not correct',
      status: 400,
      detail: 'Check both and try again',
    });
  }
  await openSession(c, user.id);
  return c.json(user, 200);
});
// #endregion sign-in

// #region sign-out
// Without a session it also answers 204: the result is the same, there's no session.
v2.openapi(contract.signOut, async (c) => {
  await closeSession(c);
  return c.body(null, 204);
});

// #endregion sign-out

// #region me
// requireIdentity (contract.ts) has already checked that there's someone: a person or a key.
v2.openapi(contract.getMe, (c) => {
  const { user, apiKey } = c.var;
  if (user) return c.json({ type: 'user' as const, ...user }, 200);
  return c.json({ type: 'key' as const, ...apiKey! }, 200);
});
// #endregion me

// #region provider-start
// What has to be remembered between the way out and the way back (state, nonce and verifier) goes
// in a cookie of its own, instead of in a table: it lasts 10 minutes, only travels to the
// provider's two routes (Path) and JavaScript doesn't read it (HttpOnly). Its job is to tie the way
// back to the browser that started: another browser doesn't have it. SameSite=Lax and not Strict:
// the way back comes from the provider's site, and with Strict the browser wouldn't send it.
const PROVIDER_COOKIE = 'provider';
const PROVIDER_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/v2/session/provider',
} as const;

v2.openapi(contract.startProviderSignIn, async (c) => {
  const { url, saved } = await startSignIn();
  const value = Buffer.from(JSON.stringify(saved)).toString('base64url');
  setCookie(c, PROVIDER_COOKIE, value, { ...PROVIDER_ATTRIBUTES, maxAge: 10 * 60 });
  return c.redirect(url.href, 302);
});
// #endregion provider-start

// #region provider-callback
// The cookie is deleted as soon as it's read: each sign-in can be finished only once.
function readStart(c: Context): SavedStart | undefined {
  const value = getCookie(c, PROVIDER_COOKIE);
  deleteCookie(c, PROVIDER_COOKIE, PROVIDER_ATTRIBUTES);
  if (value === undefined) return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    return undefined;
  }
}

const signInFailed = (
  c: Context,
  detail = "The provider's response is not valid, or this browser did not start it: start again",
) =>
  problem(c, {
    type: problemType('provider-sign-in'),
    title: 'Could not sign in with the provider',
    status: 400,
    detail,
  });

v2.openapi(contract.providerCallback, async (c) => {
  const saved = readStart(c);
  if (!saved) return signInFailed(c);
  // The callback URL, exactly as the shop registered it at the provider, with what it brings: code
  // and state. openid-client needs it whole, and the one in config doesn't change even if the shop
  // is behind a proxy.
  const callback = new URL(config.OIDC_REDIRECT_URI);
  callback.search = new URL(c.req.url).search;
  const identity = await finishSignIn(callback, saved);
  if (!identity) return signInFailed(c);

  const result = await userFromProvider(identity);
  if ('error' in result) {
    if (result.error === 'no-email') return signInFailed(c, 'The provider has not given an email');
    return problem(c, {
      type: problemType('email-not-verified'),
      title: 'That account cannot be linked',
      status: 409,
      detail:
        'There is already an account with that email, and the provider does not say the email is yours',
    });
  }
  // The same session as with a password (lesson 2): cookie, new id and on to /v2/me.
  await openSession(c, result.user.id);
  return c.redirect('/v2/me', 303);
});
// #endregion provider-callback

// #region set-notification
// The delivery company says which URL to notify. It's its API key that saves it: a person with the
// delivery role doesn't have a URL of their own. Before saving it, it's checked (safe-url.ts): if
// it points inside the server's network, 422.
v2.openapi(contract.setNotification, async (c) => {
  const { apiKey } = c.var;
  if (!apiKey) return httpProblem(c, 403, "Only with the delivery company's API key");
  const checked = await checkUrl(c.req.valid('json').url);
  if ('error' in checked) {
    return invalidData(c, [{ field: 'url', problem: checked.error }]);
  }
  const url = checked.url.href;
  return c.json({ url, secret: await saveNotification(apiKey.id, url) }, 200);
});
// #endregion set-notification

// A method the route doesn't have: 405, and in Allow, the ones it does have.
const notAllowed = (c: Context, allowed: string) =>
  httpProblem(c, 405, `This route does not accept ${c.req.method}`, { Allow: allowed });

v2.all('/products', (c) => notAllowed(c, 'GET, POST'));
v2.all('/products/:id', (c) => notAllowed(c, 'GET, DELETE'));
v2.all('/orders', (c) => notAllowed(c, 'GET, POST'));
v2.all('/orders/:id', (c) => notAllowed(c, 'GET, PATCH'));
v2.all('/orders/:id/cancellation', (c) => notAllowed(c, 'POST'));
v2.all('/orders/:id/shipment', (c) => notAllowed(c, 'POST'));
v2.all('/orders/:id/events', (c) => notAllowed(c, 'GET'));
v2.all('/webhooks/payments', (c) => notAllowed(c, 'POST'));
v2.all('/accounts', (c) => notAllowed(c, 'POST'));
v2.all('/session', (c) => notAllowed(c, 'POST, DELETE'));
v2.all('/me', (c) => notAllowed(c, 'GET'));
v2.all('/delivery/notification', (c) => notAllowed(c, 'PUT'));
v2.all('/session/provider', (c) => notAllowed(c, 'GET'));
v2.all('/session/provider/callback', (c) => notAllowed(c, 'GET'));
