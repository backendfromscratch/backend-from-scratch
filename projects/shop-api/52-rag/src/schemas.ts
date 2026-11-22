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

// #region description
// A product's description (Phase 11, lesson 5): a few sentences that say what it is and what it's
// for. With the name, it's what its vector comes from: search by meaning reads it.
export const descriptionSchema = z
  .string({ error: 'Must be text' })
  .trim()
  .min(1, "Can't be empty")
  .max(500, 'At most 500 characters')
  .openapi({ example: 'Long scarf of thick wool, for the winter cold.' });
// #endregion description

// A new product: the price, in whole cents. The description, optional (Phase 11).
export const newProductSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.optional(),
    priceCents: z
      .number({ error: 'Must be a number' })
      .int('Must be a whole number of cents')
      .positive('Must be greater than 0')
      .max(1_000_000, 'At most 1,000,000 cents (€10,000)')
      .openapi({ example: 1500, description: 'The price in cents: 1500 is €15.00' }),
  })
  .openapi('NewProduct');

// #region product-change
// Changing a product (Phase 9): the name, the price or both, with the same rules as when creating
// it. Both optional; but a change with neither ({}) changes nothing: 422.
// Since Phase 11, the description too.
export const productChangeSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    priceCents: newProductSchema.shape.priceCents.optional(),
  })
  .refine(
    (change) =>
      change.name !== undefined ||
      change.description !== undefined ||
      change.priceCents !== undefined,
    { error: 'Change at least the name, the description or the price' },
  )
  .openapi('ProductChange');
// #endregion product-change

// What the API answers. Zod doesn't check the responses: these schemas are for the contract, so
// that whoever uses the API knows what they're going to get.
export const productSchema = z
  .object({
    id: z.number().int().openapi({ example: 2 }),
    name: z.string().openapi({ example: 'Mug' }),
    priceCents: z.number().int().openapi({ example: 850 }),
    // A new field: adding it doesn't break anyone (Phase 4, lesson 4). Only in version 2.
    stock: z.number().int().min(0).openapi({ example: 12, description: 'How many units are left' }),
    // Another new field (Phase 11): null if the product has no description.
    description: z.string().nullable().openapi({
      example: 'A 350 ml ceramic mug, for the morning coffee.',
      description: "What it is and what it's for; null if it has none",
    }),
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
// checked. The MCP server's orders_to_ship tool uses it too (src/mcp.ts).
const notValid = 'The cursor is not valid';
export const cursorSchema = z
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

// What the API shows of an account: the id, the email and the role. The hash, never. catalogue
// (Phase 11) is only held by API keys.
const roleSchema = z
  .enum(['customer', 'delivery', 'admin', 'catalogue'])
  .openapi({ example: 'customer', description: 'catalogue: API keys only' });

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

// #region assistant
// The conversation with the assistant (Phase 11). The shop doesn't store conversations: the
// frontend sends the latest messages each time, and the shop passes them to the model (the model's
// API doesn't remember anything either). The limits aren't decoration: every character that reaches
// the model costs money, so at most 20 messages of 2000 characters go. And the conversation starts
// and ends with the customer: the API asks for the first message to be the user's, and the answer is
// to the last one.
export const MAX_MESSAGES = 20;
export const MAX_CHARACTERS = 2000;

export const assistantMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant'], { error: 'Must be user or assistant' }),
    text: z
      .string({ error: 'Must be text' })
      .trim()
      .min(1, "Can't be empty")
      .max(MAX_CHARACTERS, `At most ${MAX_CHARACTERS} characters`)
      .openapi({ example: 'Hi, can you help me with an order?' }),
  })
  .openapi('AssistantMessage');

export const assistantQuestionSchema = z
  .object({
    messages: z
      .array(assistantMessageSchema, { error: 'Must be a list of messages' })
      .min(1, 'At least one message')
      .max(MAX_MESSAGES, `At most the last ${MAX_MESSAGES} messages`)
      .refine((messages) => messages[0]?.role === 'user', {
        error: "The first message must be the user's",
      })
      .refine((messages) => messages.at(-1)?.role === 'user', {
        error: "The last message must be the user's: it's the one the assistant answers",
      })
      .openapi({
        description:
          "The conversation, from the oldest message to the last question: it starts and ends with one of the user's",
      }),
  })
  .openapi('AssistantQuestion');

// A source (lesson 6): a section of a help page the assistant's answer cites.
export const assistantSourceSchema = z
  .object({
    page: z.string().openapi({
      description: "The help page: its file's name, without .md",
      example: 'returns',
    }),
    title: z.string().openapi({
      description: "The page's title",
      example: 'Cancellations and returns',
    }),
    section: z.string().openapi({
      description: "The section's heading",
      example: 'Returning a product',
    }),
  })
  .openapi('AssistantSource');

// What it answers: the text, whether the model refused to answer (then the text is a fixed sentence
// of the shop's) and how many tokens it cost. A token is a piece of a word: it's what the API counts
// and charges. With tools (lesson 3), an answer is several calls to the model, and they're all paid
// for: usage adds them up. And, since lesson 6, its sources: the sections of the help it cites.
// They come from the citations the API puts in the answer, and the shop looks them up among what
// search_help returned: each section's data is the shop's own. An "I don't know" cites nothing: no
// sources.
export const assistantAnswerSchema = z
  .object({
    text: z.string().openapi({ example: 'Hi, Carmen! How can I help?' }),
    refused: z.boolean().openapi({
      description: 'true if the model refused to answer: text is then a fixed sentence',
    }),
    usage: z
      .object({
        input: z.number().int().openapi({ example: 412 }),
        output: z.number().int().openapi({ example: 38 }),
      })
      .openapi({
        description:
          "The input tokens (instructions, tools and conversation) and the answer's, adding up those of every call to the model",
      }),
    sources: z.array(assistantSourceSchema).openapi({
      description:
        "The sections of the shop's help the answer cites (out of the ones the assistant's search_help tool returned), without repeats, in the order it cites them. Empty if it cites none (it didn't search the help, or the help doesn't say what was asked) or if it refused to answer",
    }),
  })
  .openapi('AssistantAnswer');
// #endregion assistant
