// The schemas: the shape that the data coming from outside must have. Zod checks them while the
// program runs, which is exactly what TypeScript's types don't do.
import { z } from 'zod';
import { readCursor } from './pagination.ts';

// #region order
export const orderSchema = z.object({
  productId: z.number({ error: 'Must be a number' }).int('Must be a whole number'),
  quantity: z
    .number({ error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'At least 1')
    .max(10, 'At most 10 per order'),
});

// The type comes from the schema: there's no need to write it twice.
export type OrderInput = z.infer<typeof orderSchema>;
// #endregion order

// #region order-change
// The only thing the client can change in an order is the quantity. Not the status: it changes with
// what happens (a payment, a shipment, a cancellation), not because someone writes it.
export const orderChangeSchema = z.object({
  quantity: orderSchema.shape.quantity,
});
// #endregion order-change

export const productSchema = z.object({
  name: z
    .string({ error: 'Must be text' })
    .trim()
    .min(1, "Can't be empty")
    .max(60, 'At most 60 characters'),
  price: z
    .number({ error: 'Must be a number' })
    .positive('Must be greater than 0')
    .max(10_000, 'At most €10,000'),
});

// #region params
// What comes in the path and in the query string is always text: coerce turns it into a number.
export const idSchema = z.object({
  id: z.coerce.number({ error: 'Must be a number' }).int('Must be a whole number'),
});

export const filterSchema = z.object({
  max: z.coerce.number({ error: 'Must be a number' }).positive('Must be greater than 0').optional(),
  // price, from lowest to highest; -price, from highest to lowest.
  sort: z.enum(['price', '-price'], { error: 'Must be price or -price' }).optional(),
});
// #endregion params

// #region cursor-schema
// The cursor arrives as text: it's turned into the id it carries inside, and that id is checked.
const cursorSchema = z
  .string()
  .transform(readCursor)
  .pipe(z.number({ error: 'The cursor is not valid' }).int().positive('The cursor is not valid'));
// #endregion cursor-schema

// #region order-list
// What can be asked for in GET /orders. Everything is optional: with nothing, the first page of 10.
export const orderListSchema = z
  .object({
    limit: z.coerce
      .number({ error: 'Must be a number' })
      .int('Must be a whole number')
      .min(1, 'At least 1')
      .max(50, 'At most 50')
      .default(10),
    cursor: cursorSchema.optional(),
    offset: z.coerce
      .number({ error: 'Must be a number' })
      .int('Must be a whole number')
      .min(0, 'At least 0')
      .optional(),
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
// #endregion order-list
