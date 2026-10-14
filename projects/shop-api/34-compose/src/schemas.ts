// The schemas: the shape of the data coming in and going out. Zod checks them while the program
// runs and, from lesson 5, the documentation's schemas (OpenAPI) come from them too. That's why z
// comes from @hono/zod-openapi: it's Zod's z, with one more method, .openapi().
import { z } from '@hono/zod-openapi';
import { readCursor } from './pagination.ts';
import { passwordProblem } from './passwords.ts';

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
    // A new field: adding it doesn't break anyone (Phase 4, lesson 4). Only in version 2.
    stock: z.number().int().min(0).openapi({ example: 12, description: 'How many units are left' }),
    categories: z
      .array(z.string())
      .openapi({ example: ['Home', 'Gifts'], description: 'Its categories, by name' }),
  })
  .openapi('Product');

export const orderSchema = z
  .object({
    id: z.number().int().openapi({ example: 7 }),
    productId: z.number().int().openapi({ example: 1 }),
    quantity: z.number().int().openapi({ example: 2 }),
    status: z.enum(['pending', 'paid', 'shipped', 'cancelled']),
    // A date and time in ISO 8601: in the contract it shows up as a string with format: date-time.
    createdAt: z.iso.datetime().openapi({ example: '2026-10-13T09:30:00.000Z' }),
    // Whose it is: their account's id. null in the orders from before there were accounts.
    customerId: z.number().int().nullable().openapi({ example: 3 }),
  })
  .openapi('Order');

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
  category: z.string({ error: 'Must be text' }).trim().min(1, "Can't be empty").optional().openapi({
    example: 'clothing',
    description: 'Only the ones in this category (capital letters do not matter)',
  }),
});

// The cursor arrives as text: it's turned into the date and the id it carries inside, and they're
// checked.
const notValid = 'The cursor is not valid';
const cursorSchema = z
  .string()
  .transform(readCursor)
  .pipe(
    z.object(
      {
        createdAt: z.iso.datetime({ error: notValid }),
        id: z.number({ error: notValid }).int(notValid).positive(notValid),
      },
      { error: notValid },
    ),
  );

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

// The payment gateway's notification: what happened (type), with which order and an event id.
export const paymentEventSchema = z
  .object({
    id: z.string({ error: 'Must be text' }).min(1).openapi({ example: 'evt_1234' }),
    type: z.literal('payment.completed', { error: 'Only completed payments are accepted' }),
    orderId: z.number({ error: 'Must be a number' }).int().openapi({ example: 7 }),
  })
  .openapi('PaymentEvent');

// What the shop answers: received, and whether it had already received it before.
export const ackSchema = z
  .object({ received: z.string(), repeated: z.boolean() })
  .openapi('Acknowledgement');

// #region new-account
// A new account: the email and the password. The password's rules are in passwords.ts;
// superRefine applies them and, if one fails, puts its message as the field's problem.
export const newAccountSchema = z
  .object({
    email: z
      .email({ error: 'Must be an email' })
      .max(254, 'At most 254 characters')
      .openapi({ example: 'marta@example.com' }),
    password: z
      .string({ error: 'Must be text' })
      .superRefine((password, context) => {
        const problem = passwordProblem(password);
        if (problem) context.addIssue({ code: 'custom', message: problem });
      })
      .openapi({
        example: 'a long sentence only I know',
        description: 'From 15 to 128 characters, and not one of the most used',
      }),
  })
  .openapi('NewAccount');

// What the API shows of an account: the id, the email and the role. The hash, never.
const roleSchema = z.enum(['customer', 'delivery', 'admin']).openapi({ example: 'customer' });

export const userSchema = z
  .object({
    id: z.number().int().openapi({ example: 5 }),
    email: z.string().openapi({ example: 'marta@example.com' }),
    role: roleSchema,
  })
  .openapi('User');
// #endregion new-account

// #region credentials
// For signing in: the password's rules don't apply here (that's when creating it), only a cap, so
// as not to compute the hash of a huge text.
export const credentialsSchema = z
  .object({
    email: z
      .string({ error: 'Must be text' })
      .max(254, 'At most 254 characters')
      .openapi({ example: 'ana@shop.example' }),
    password: z
      .string({ error: 'Must be text' })
      .min(1, 'Cannot be empty')
      .max(128, 'At most 128 characters')
      .openapi({ example: 'ana-practice-2026' }),
  })
  .openapi('Credentials');
// #endregion credentials

// #region me
// Who you are: a person (with their email) or a program (with its key's name). type says which.
export const meSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('user'),
      id: z.number().int(),
      email: z.string(),
      role: roleSchema,
    }),
    z.object({
      type: z.literal('key'),
      id: z.number().int(),
      name: z.string().openapi({ example: 'Fast Delivery' }),
      role: roleSchema,
    }),
  ])
  .openapi('Me');
// #endregion me

// #region notification
// The URL the delivery company wants the notifications at, and what the shop answers: the URL as
// it saved it and the secret it will sign each notice with (each time, a new one).
export const notificationSchema = z
  .object({
    url: z
      .string({ error: 'Must be text' })
      .max(2000, 'At most 2000 characters')
      .openapi({ example: 'https://delivery.example/notifications' }),
  })
  .openapi('Notification');

export const savedNotificationSchema = z
  .object({ url: z.string(), secret: z.string() })
  .openapi('SavedNotification');
// #endregion notification
