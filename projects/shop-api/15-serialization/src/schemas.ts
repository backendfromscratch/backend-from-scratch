// The schemas: the shape of the data coming in and going out. Zod checks them while the program
// runs and, from lesson 5, the documentation's schemas (OpenAPI) come from them too. That's why z
// comes from @hono/zod-openapi: it's Zod's z, with one more method, .openapi().
import { z } from '@hono/zod-openapi';
import { readCursor } from './pagination.ts';

// What arrives in the body. .openapi('Name') gives it a name in the documentation, and example is
// a sample value that the /docs page fills in when trying a route.
export const newOrderSchema = z
  .object({
    productId: z
      .number({ error: 'Must be a number' })
      .int('Must be a whole number')
      .openapi({ example: 1 }),
    quantity: z
      .number({ error: 'Must be a number' })
      .int('Must be a whole number')
      .min(1, 'At least 1')
      .max(10, 'At most 10 per order')
      .openapi({ example: 2 }),
  })
  .openapi('NewOrder');

// The only thing the client can change in an order is the quantity. Not the status: it changes with
// what happens (a payment, a shipment, a cancellation), not because someone writes it.
export const orderChangeSchema = z
  .object({ quantity: newOrderSchema.shape.quantity })
  .openapi('OrderChange');

export const nameSchema = z
  .string({ error: 'Must be text' })
  .trim()
  .min(1, "Can't be empty")
  .max(60, 'At most 60 characters')
  .openapi({ example: 'Cap' });

// A new product: the price, in whole cents.
export const newProductSchema = z
  .object({
    name: nameSchema,
    priceCents: z
      .number({ error: 'Must be a number' })
      .int('Must be a whole number of cents')
      .positive('Must be greater than 0')
      .max(1_000_000, 'At most 1,000,000 cents (€10,000)')
      .openapi({ example: 1500, description: 'The price in cents: 1500 is €15.00' }),
  })
  .openapi('NewProduct');

// What the API answers. Zod doesn't check the responses: these schemas are for the contract, so
// that whoever uses the API knows what they're going to get.
export const productSchema = z
  .object({
    id: z.number().int().openapi({ example: 2 }),
    name: z.string().openapi({ example: 'Mug' }),
    priceCents: z.number().int().openapi({ example: 850 }),
  })
  .openapi('Product');

// #region order
export const orderSchema = z
  .object({
    id: z.number().int().openapi({ example: 7 }),
    productId: z.number().int().openapi({ example: 1 }),
    quantity: z.number().int().openapi({ example: 2 }),
    status: z.enum(['pending', 'paid', 'shipped', 'cancelled']),
    // A date and time in ISO 8601: in the contract it shows up as a string with format: date-time.
    createdAt: z.iso.datetime().openapi({ example: '2026-10-13T09:30:00.000Z' }),
  })
  .openapi('Order');
// #endregion order

// An error, with the shape of RFC 9457 (lesson 2).
export const problemSchema = z
  .object({
    type: z.string().openapi({ example: 'https://shop.example/problems/invalid-data' }),
    title: z.string().openapi({ example: 'The data is not valid' }),
    status: z.number().int().openapi({ example: 422 }),
    detail: z.string().optional(),
    instance: z.string().optional(),
    errors: z.array(z.object({ field: z.string(), problem: z.string() })).optional(),
  })
  .openapi('Problem');

// What comes in the path and in the query string is always text: coerce turns it into a number.
// Since coerce accepts anything, the documentation couldn't tell what type it is or that it's
// required: .openapi() tells it.
export const idSchema = z.object({
  id: z.coerce
    .number({ error: 'Must be a number' })
    .int('Must be a whole number')
    .openapi({ type: 'integer', param: { required: true }, example: 2 }),
});

export const filterSchema = z.object({
  maxCents: z.coerce
    .number({ error: 'Must be a number' })
    .int('Must be a whole number of cents')
    .positive('Must be greater than 0')
    .optional()
    .openapi({ type: 'integer', description: 'Only the ones that cost this or less, in cents' }),
  sort: z
    .enum(['price', '-price'], { error: 'Must be price or -price' })
    .optional()
    .openapi({ description: 'price, from lowest to highest; -price, from highest to lowest' }),
});

// The cursor arrives as text: it's turned into the id it carries inside, and that id is checked.
const cursorSchema = z
  .string()
  .transform(readCursor)
  .pipe(z.number({ error: 'The cursor is not valid' }).int().positive('The cursor is not valid'));

// What can be asked for in GET /orders. Everything is optional: with nothing, the first page of 10.
export const orderListSchema = z
  .object({
    limit: z.coerce
      .number({ error: 'Must be a number' })
      .int('Must be a whole number')
      .min(1, 'At least 1')
      .max(50, 'At most 50')
      .default(10),
    cursor: cursorSchema
      .optional()
      .openapi({ description: "The one in the previous page's Link header" }),
    offset: z.coerce
      .number({ error: 'Must be a number' })
      .int('Must be a whole number')
      .min(0, 'At least 0')
      .optional()
      .openapi({ type: 'integer', description: 'How many to skip (to compare with the cursor)' }),
    // The same statuses as OrderStatus, in data.ts.
    status: z
      .enum(['pending', 'paid', 'shipped', 'cancelled'], {
        error: 'Must be pending, paid, shipped or cancelled',
      })
      .optional(),
  })
  .refine((query) => query.cursor === undefined || query.offset === undefined, {
    error: 'Use cursor or offset, not both',
    path: ['cursor'],
  });
