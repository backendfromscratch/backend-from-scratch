// Version 2's contract: each route, with what it receives and what it can answer. Each request is
// validated with it and the documentation is written from it (/v2/openapi.json): both come from
// the same schemas, so they can't contradict each other.
import { createRoute, z } from '@hono/zod-openapi';
import { idempotency } from './middleware/idempotency.ts';
import { requireIdentity } from './middleware/session.ts';
import { verifySignature } from './middleware/verify-signature.ts';
import { requirePermission } from './permissions.ts';
import {
  ackSchema,
  credentialsSchema,
  filterSchema,
  idSchema,
  meSchema,
  newAccountSchema,
  newOrderSchema,
  newProductSchema,
  notificationSchema,
  orderChangeSchema,
  orderListSchema,
  orderSchema,
  paymentEventSchema,
  problemSchema,
  productSchema,
  savedNotificationSchema,
  userSchema,
} from './schemas.ts';

// Pieces that repeat: a response in JSON and an error response (Problem Details).
function asJson<Schema extends z.ZodType>(schema: Schema, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

function withProblem(description: string) {
  return { description, content: { 'application/problem+json': { schema: problemSchema } } };
}

// A required JSON body: without required, a request without a body wouldn't be validated.
function jsonBody<Schema extends z.ZodType>(schema: Schema) {
  return { required: true, content: { 'application/json': { schema } } };
}

const invalidData = withProblem('The data is not valid: "errors" says what is wrong');
const withLocation = {
  Location: { description: 'The URL of the new resource', schema: { type: 'string' as const } },
};

// #region with-session
// The routes that ask you to identify yourself: with the session cookie or with Authorization:
// Bearer (a session's id or an API key). requirePermission (permissions.ts) checks the permission
// needed, in middleware, before validating anything else: if it doesn't know who you are, 401; if
// you can't, 403.
const withSession: { [name: string]: string[] }[] = [{ Session: [] }, { Bearer: [] }];
const noIdentity = withProblem("It doesn't know who you are: sign in or use your API key");
const noPermission = withProblem('It knows who you are, and you do not have permission for this');
// #endregion with-session

export const getProduct = createRoute({
  method: 'get',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'A product',
  request: { params: idSchema },
  responses: {
    200: asJson(productSchema, 'The product'),
    404: withProblem('No such product'),
    422: invalidData,
  },
});

export const listProducts = createRoute({
  method: 'get',
  path: '/products',
  tags: ['Products'],
  summary: 'The products, filtered and sorted',
  request: { query: filterSchema },
  responses: {
    200: asJson(z.array(productSchema), 'The products'),
    422: invalidData,
  },
});

// Creating and deleting products: only whoever has products:manage (admin). Before it was a shared
// token (ADMIN_TOKEN); now, the role of each person's account.
export const createProduct = createRoute({
  method: 'post',
  path: '/products',
  tags: ['Products'],
  summary: 'Creates a product',
  security: withSession,
  middleware: [requirePermission('products:manage')] as const,
  request: { body: jsonBody(newProductSchema) },
  responses: {
    201: { ...asJson(productSchema, 'The created product'), headers: withLocation },
    401: noIdentity,
    403: noPermission,
    422: invalidData,
  },
});

export const deleteProduct = createRoute({
  method: 'delete',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'Deletes a product',
  security: withSession,
  middleware: [requirePermission('products:manage')] as const,
  request: { params: idSchema },
  responses: {
    204: { description: "Deleted: there's nothing more to tell" },
    401: noIdentity,
    403: noPermission,
    404: withProblem('No such product'),
    409: withProblem('The product has orders: it cannot be deleted'),
    422: invalidData,
  },
});

// Seeing orders: a customer, their own; delivery and admin, all of them.
const viewOrders = requirePermission('orders:view-own', 'orders:view-all');

export const listOrders = createRoute({
  method: 'get',
  path: '/orders',
  tags: ['Orders'],
  summary: 'A page of orders (yours, if you are a customer), from newest to oldest',
  security: withSession,
  middleware: [viewOrders] as const,
  request: { query: orderListSchema },
  responses: {
    200: {
      ...asJson(z.array(orderSchema), "This page's orders"),
      headers: {
        Link: {
          description: 'If there are more, the URL of the next page (rel="next")',
          schema: { type: 'string' as const },
        },
      },
    },
    401: noIdentity,
    403: noPermission,
    422: invalidData,
  },
});

export const getOrder = createRoute({
  method: 'get',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'An order',
  security: withSession,
  middleware: [viewOrders] as const,
  request: { params: idSchema },
  responses: {
    200: asJson(orderSchema, 'The order'),
    401: noIdentity,
    403: noPermission,
    404: withProblem('No such order, or it is not yours'),
    422: invalidData,
  },
});

// With an Idempotency-Key, repeating the request doesn't create another order: it returns the same
// response.
// Placing an order needs a customer's session: the order is theirs. requirePermission goes before
// idempotency, which stores each key with the account that used it.
export const createOrder = createRoute({
  method: 'post',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Creates an order',
  security: withSession,
  middleware: [requirePermission('orders:create'), idempotency] as const,
  request: {
    headers: z.object({
      'idempotency-key': z.string().optional().openapi({ example: 'b1c2d3e4-anas-order' }),
    }),
    body: jsonBody(newOrderSchema),
  },
  responses: {
    201: {
      ...asJson(orderSchema, 'The created order (or the same one, if the key is repeated)'),
      headers: withLocation,
    },
    401: noIdentity,
    403: noPermission,
    409: withProblem('Not enough stock of that product is left'),
    422: invalidData,
  },
});

// #region follow-order
// Server-Sent Events: a response that doesn't end. The content type, text/event-stream.
export const followOrder = createRoute({
  method: 'get',
  path: '/orders/{id}/events',
  tags: ['Orders'],
  summary: "An order's status changes, live",
  security: withSession,
  middleware: [viewOrders] as const,
  request: { params: idSchema },
  responses: {
    200: {
      description: 'A "status" event with the current order and, after that, one for each change',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    401: noIdentity,
    403: noPermission,
    404: withProblem('No such order, or it is not yours'),
    422: invalidData,
  },
});
// #endregion follow-order

// Changing the quantity or cancelling: a customer, their orders; admin, any of them.
const changeOrders = requirePermission('orders:change-own', 'orders:change-all');

export const changeOrder = createRoute({
  method: 'patch',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Changes the quantity of a pending order',
  security: withSession,
  middleware: [changeOrders] as const,
  request: { params: idSchema, body: jsonBody(orderChangeSchema) },
  responses: {
    200: asJson(orderSchema, 'The order, changed'),
    401: noIdentity,
    403: noPermission,
    404: withProblem('No such order, or it is not yours'),
    409: withProblem('The order is no longer pending'),
    422: invalidData,
  },
});

export const cancelOrder = createRoute({
  method: 'post',
  path: '/orders/{id}/cancellation',
  tags: ['Orders'],
  summary: "Cancels an order that hasn't been shipped yet",
  security: withSession,
  middleware: [changeOrders] as const,
  request: { params: idSchema },
  responses: {
    200: asJson(orderSchema, 'The order, cancelled'),
    401: noIdentity,
    403: noPermission,
    404: withProblem('No such order, or it is not yours'),
    409: withProblem('The order is already shipped'),
    422: invalidData,
  },
});

// #region ship-order
// The delivery company marks a paid order as shipped. A new route, for the orders:ship
// permission: delivery and admin.
export const shipOrder = createRoute({
  method: 'post',
  path: '/orders/{id}/shipment',
  tags: ['Orders'],
  summary: 'Marks a paid order as shipped',
  security: withSession,
  middleware: [requirePermission('orders:ship')] as const,
  request: { params: idSchema },
  responses: {
    200: asJson(orderSchema, 'The order, shipped'),
    401: noIdentity,
    403: noPermission,
    404: withProblem('No such order'),
    409: withProblem('The order is not paid'),
    422: invalidData,
  },
});
// #endregion ship-order

// The webhook: the payment gateway calls here when an order is paid. verifySignature goes before
// everything else: a notification without a valid signature isn't read.
export const receivePayment = createRoute({
  method: 'post',
  path: '/webhooks/payments',
  tags: ['Webhooks'],
  summary: 'The payment gateway reports a payment',
  middleware: [verifySignature] as const,
  request: {
    headers: z.object({ 'x-signature': z.string().openapi({ example: 'sha256=5f2b…' }) }),
    body: jsonBody(paymentEventSchema),
  },
  responses: {
    200: asJson(ackSchema, 'Received'),
    400: withProblem('The signature is not valid'),
    422: invalidData,
  },
});

// #region create-account
// Signing up. A repeated email is a 409; a password that doesn't meet the rules, the usual 422,
// with the reason in "errors".
export const createAccount = createRoute({
  method: 'post',
  path: '/accounts',
  tags: ['Accounts'],
  summary: 'Creates an account',
  request: { body: jsonBody(newAccountSchema) },
  responses: {
    201: { ...asJson(userSchema, 'The created account'), headers: withLocation },
    409: withProblem('There is already an account with that email'),
    422: invalidData,
    429: withProblem('Too many attempts: wait what Retry-After says'),
  },
});
// #endregion create-account

// #region session
// Signing in: if the email and the password are right, 200 with the account and the cookie in
// Set-Cookie. If not, 400: it's what OAuth 2.0 answers to a wrong password (RFC 6749,
// invalid_grant). A 401 would say "identify yourself with WWW-Authenticate", and this route doesn't
// ask you to identify yourself: it's where you do it.
export const signIn = createRoute({
  method: 'post',
  path: '/session',
  tags: ['Session'],
  summary: 'Signs in',
  request: { body: jsonBody(credentialsSchema) },
  responses: {
    200: {
      ...asJson(userSchema, 'The account; the session goes in the cookie'),
      headers: {
        'Set-Cookie': {
          description: 'session=<id>; HttpOnly; Secure; SameSite=Lax',
          schema: { type: 'string' as const },
        },
      },
    },
    400: withProblem('The email or the password is not correct'),
    422: invalidData,
    429: withProblem('Too many attempts: wait what Retry-After says'),
  },
});

export const signOut = createRoute({
  method: 'delete',
  path: '/session',
  tags: ['Session'],
  summary: 'Signs out',
  responses: { 204: { description: 'Signed out: the cookie, deleted' } },
});

// Who I am: the session's account (in the cookie or as Bearer) or the API key (as Bearer).

export const getMe = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Session'],
  summary: 'Who you are: your account or your API key',
  security: withSession,
  middleware: [requireIdentity] as const,
  responses: {
    200: asJson(meSchema, 'Your account, or your key'),
    401: noIdentity,
  },
});
// #endregion session

// #region provider
// Signing in with the identity provider (lesson 4): two routes, the way out and the way back. The
// browser opens both, not a program: they answer with redirects.
const withDestination = (description: string) => ({
  description,
  headers: {
    Location: { description: 'Where the browser goes', schema: { type: 'string' as const } },
  },
});

export const startProviderSignIn = createRoute({
  method: 'get',
  path: '/session/provider',
  tags: ['Session'],
  summary: 'Signs in with the identity provider: sends the browser there',
  responses: {
    302: withDestination('To the provider, with the state, the nonce and the PKCE challenge'),
    404: withProblem('The shop has no identity provider'),
  },
});

export const providerCallback = createRoute({
  method: 'get',
  path: '/session/provider/callback',
  tags: ['Session'],
  summary: "The provider's way back: checks the response and opens the session",
  request: {
    query: z.object({ code: z.string().optional(), state: z.string().optional() }),
  },
  responses: {
    303: withDestination('To /v2/me, with the session already in the cookie'),
    400: withProblem("The provider's response is not valid, or this browser did not start it"),
    404: withProblem('The shop has no identity provider'),
    409: withProblem(
      'There is already an account with that email, and the provider does not say it is yours',
    ),
  },
});
// #endregion provider

// #region set-notification
export const setNotification = createRoute({
  method: 'put',
  path: '/delivery/notification',
  tags: ['Delivery'],
  summary: 'The URL to notify of each paid order',
  security: withSession,
  middleware: [requirePermission('notifications:configure')] as const,
  request: { body: jsonBody(notificationSchema) },
  responses: {
    200: asJson(savedNotificationSchema, "Saved, with the signatures' secret"),
    401: noIdentity,
    403: noPermission,
    422: invalidData,
  },
});
// #endregion set-notification
