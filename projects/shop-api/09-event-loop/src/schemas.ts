// The schemas: the shape that the data coming from outside must have. Zod checks them while the
// program runs, which is exactly what TypeScript's types don't do.
import { z } from 'zod';

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
});
// #endregion params
