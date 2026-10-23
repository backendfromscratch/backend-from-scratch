// Version 2's contract: each route, with what it receives and what it can answer. Each request is
// validated with it and the documentation is written from it (/v2/openapi.json): both come from
// the same schemas, so they can't contradict each other.
import { createRoute, z } from '@hono/zod-openapi';
import { adminOnly } from './middleware/admin-only.ts';
import { idempotency } from './middleware/idempotency.ts';
import { requireIdentity } from './middleware/session.ts';
import { verifySignature } from './middleware/verify-signature.ts';
import {
  ackSchema,
  credentialsSchema,
  filterSchema,
  idSchema,
  newAccountSchema,
  newOrderSchema,
  newProductSchema,
  orderChangeSchema,
  orderListSchema,
  orderSchema,
  paymentEventSchema,
  problemSchema,
  productSchema,
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
const noToken = withProblem('The admin token is missing, or it is not valid');
const withLocation = {
  Location: { description: 'The URL of the new resource', schema: { type: 'string' as const } },
};

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

// security says in the documentation that a token is needed; middleware checks it before
// validating the body, as before.
export const createProduct = createRoute({
  method: 'post',
  path: '/products',
  tags: ['Products'],
  summary: 'Creates a product',
  security: [{ Bearer: [] }],
  middleware: [adminOnly] as const,
  request: { body: jsonBody(newProductSchema) },
  responses: {
    201: { ...asJson(productSchema, 'The created product'), headers: withLocation },
    401: noToken,
    422: invalidData,
  },
});

export const deleteProduct = createRoute({
  method: 'delete',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'Deletes a product',
  security: [{ Bearer: [] }],
  middleware: [adminOnly] as const,
  request: { params: idSchema },
  responses: {
    204: { description: "Deleted: there's nothing more to tell" },
    401: noToken,
    404: withProblem('No such product'),
    409: withProblem('The product has orders: it cannot be deleted'),
    422: invalidData,
  },
});

export const listOrders = createRoute({
  method: 'get',
  path: '/orders',
  tags: ['Orders'],
  summary: 'A page of orders, from newest to oldest',
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
    422: invalidData,
  },
});

export const getOrder = createRoute({
  method: 'get',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'An order',
  request: { params: idSchema },
  responses: {
    200: asJson(orderSchema, 'The order'),
    404: withProblem('No such order'),
    422: invalidData,
  },
});

// With an Idempotency-Key, repeating the request doesn't create another order: it returns the same
// response.
export const createOrder = createRoute({
  method: 'post',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Creates an order',
  middleware: [idempotency] as const,
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
  request: { params: idSchema },
  responses: {
    200: {
      description: 'A "status" event with the current order and, after that, one for each change',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    404: withProblem('No such order'),
    422: invalidData,
  },
});
// #endregion follow-order

export const changeOrder = createRoute({
  method: 'patch',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Changes the quantity of a pending order',
  request: { params: idSchema, body: jsonBody(orderChangeSchema) },
  responses: {
    200: asJson(orderSchema, 'The order, changed'),
    404: withProblem('No such order'),
    409: withProblem('The order is no longer pending, or there is not enough stock'),
    422: invalidData,
  },
});

export const cancelOrder = createRoute({
  method: 'post',
  path: '/orders/{id}/cancellation',
  tags: ['Orders'],
  summary: "Cancels an order that hasn't been shipped yet",
  request: { params: idSchema },
  responses: {
    200: asJson(orderSchema, 'The order, cancelled'),
    404: withProblem('No such order'),
    409: withProblem('The order is already shipped'),
    422: invalidData,
  },
});

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
  },
});

export const signOut = createRoute({
  method: 'delete',
  path: '/session',
  tags: ['Session'],
  summary: 'Signs out',
  responses: { 204: { description: 'Signed out: the cookie, deleted' } },
});

// Who I am: the session's account. The cookie or Authorization: Bearer <id> are valid.
const withSession: { [name: string]: string[] }[] = [{ Session: [] }, { Bearer: [] }];
const noSession = withProblem('You have not signed in, or the session has expired');

export const getMe = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Session'],
  summary: 'The account you have signed in with',
  security: withSession,
  middleware: [requireIdentity] as const,
  responses: {
    200: asJson(userSchema, 'Your account'),
    401: noSession,
  },
});
// #endregion session
