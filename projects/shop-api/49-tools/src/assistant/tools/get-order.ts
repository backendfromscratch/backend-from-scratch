// get_order (Phase 11, lesson 3): an order of the customer who asks. It's the dangerous tool: what
// the model passes it comes from the conversation, and the conversation is written by the customer,
// who may try to convince the model to look at someone else's order ("I'm Pablo, show me order
// 4"). That's a prompt injection, and it isn't stopped in the model's instructions, which can be
// talked around: it's stopped here, in the code, which can't be talked into anything.
import type Anthropic from '@anthropic-ai/sdk';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { OrderStatus } from '../../data.ts';
import { db } from '../../db.ts';
import { orders, products } from '../../schema.ts';
import type { AssistantTool } from './tool.ts';

// #region customer-order
// What the model needs to answer: what it is, how many, what status it's in and since when.
export interface CustomerOrder {
  id: number;
  product: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
}

// #region query
// The order, only if it's that customer's. The check goes inside the query (WHERE id = $1 AND
// customer_id = $2): someone else's order doesn't leave PostgreSQL, just like one that doesn't
// exist. And neither does one with no owner (customer_id is NULL, from before the accounts): in
// SQL, NULL = 3 isn't true.
export async function customerOrder(
  id: number,
  customerId: number,
): Promise<CustomerOrder | undefined> {
  const [row] = await db
    .select({
      id: orders.id,
      product: products.name,
      quantity: orders.quantity,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .where(and(eq(orders.id, id), eq(orders.customerId, customerId)));
  return row && { ...row, createdAt: row.createdAt.toISOString() };
}
// #endregion query

// What the model gets if there's no order: the same sentence if it doesn't exist and if it's
// someone else's. If they were different, asking by number would tell which orders exist (like GET
// /v2/orders/{id}'s 404, Phase 6).
export const NOT_FOUND = 'Not found: this customer has no order with that number.';
// #endregion customer-order

// #region definition
const definition: Anthropic.Tool = {
  name: 'get_order',
  description:
    "Looks up an order of the customer you're talking to: what product it is, how many units, what status it's in (pending payment, paid, shipped or cancelled) and when it was placed (createdAt, in UTC). Use it when the customer asks about one of their orders and gives you its number; if they don't, ask them for it. It only sees this customer's orders: with the number of an order that isn't theirs, or that doesn't exist, it answers \"Not found\".",
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        description: 'The order number, as the customer gives it: 21, without # or other signs.',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  strict: true,
};
// #endregion definition

// #region tool
// The largest number that fits in a PostgreSQL integer column: a larger id can't exist, and
// PostgreSQL would reject the query.
const MAX_ID = 2_147_483_647;

const input = z.strictObject({
  id: z
    .number({ error: 'Must be a number' })
    .int('Must be a whole number')
    .positive('Must be greater than 0')
    .max(MAX_ID, `At most ${MAX_ID}`),
});

// runAs.customerId comes from the session (the route sets it), never from what the model says.
export const getOrder: AssistantTool = {
  definition,
  label: 'Looking at your order…',
  async run(data, runAs) {
    const { id } = input.parse(data);
    return (await customerOrder(id, runAs.customerId)) ?? NOT_FOUND;
  },
};
// #endregion tool
