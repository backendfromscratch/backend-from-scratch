// Version 2's contract: each route, with what it receives and what it can answer. Each request is
// validated with it and the documentation is written from it (/v2/openapi.json): both come from
// the same schemas, so they can't contradict each other.
import { createRoute, z } from '@hono/zod-openapi';
import { adminOnly } from './middleware/admin-only.ts';
import {
  filterSchema,
  idSchema,
  newOrderSchema,
  newProductSchema,
  orderChangeSchema,
  orderListSchema,
  orderSchema,
  problemSchema,
  productSchema,
} from './schemas.ts';

// #region pieces
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
// #endregion pieces

// #region get-product
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
// #endregion get-product

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

// #region create-product
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
// #endregion create-product

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

export const createOrder = createRoute({
  method: 'post',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Creates an order',
  request: { body: jsonBody(newOrderSchema) },
  responses: {
    201: { ...asJson(orderSchema, 'The created order'), headers: withLocation },
    422: invalidData,
  },
});

export const changeOrder = createRoute({
  method: 'patch',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Changes the quantity of a pending order',
  request: { params: idSchema, body: jsonBody(orderChangeSchema) },
  responses: {
    200: asJson(orderSchema, 'The order, changed'),
    404: withProblem('No such order'),
    409: withProblem('The order is no longer pending'),
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
