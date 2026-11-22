// search_products (Phase 11, lesson 3): the catalogue, for the assistant. For now it searches by
// name; lesson 5 changes it to search by meaning ("something for the cold"), without the model
// noticing anything: its name, its description and what it returns stay the same.
import type Anthropic from '@anthropic-ai/sdk';
import { asc, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db.ts';
import { products } from '../../schema.ts';
import type { AssistantTool } from './tool.ts';

// #region search
// How many products it returns at most: what a tool returns goes into the conversation, and every
// token of the conversation is paid for again in every round left.
export const MAX_PRODUCTS = 10;

// Of each product, just what's needed to answer: without the categories, which the model doesn't
// need.
export interface FoundProduct {
  id: number;
  name: string;
  priceCents: number;
  stock: number;
}

// The products whose name contains the query, regardless of case: ILIKE, PostgreSQL's LIKE that
// doesn't tell "Mug" from "mug". It's the function that does the work, and it knows nothing about
// the model: lesson 4's MCP server calls this same one.
export function searchProductsByName(query: string): Promise<FoundProduct[]> {
  return db
    .select({
      id: products.id,
      name: products.name,
      priceCents: products.priceCents,
      stock: products.stock,
    })
    .from(products)
    .where(ilike(products.name, `%${noWildcards(query)}%`))
    .orderBy(asc(products.id))
    .limit(MAX_PRODUCTS);
}

// In a LIKE, % means "anything" and _ means "any one letter". What the model searches for is text,
// not a pattern: a \ goes before each of them (and before the \, which is the one that escapes), and
// they count as what they are. Without this, a query "%" would return the whole catalogue.
const noWildcards = (text: string) => text.replace(/[\\%_]/g, '\\$&');
// #endregion search

// #region definition
// What the model sees. The description isn't for people: it's what the model reads to decide when
// to use it, what to pass it and how to read what it returns. strict: true makes the API only let
// the model call it with an input that matches the schema (an object with query, a string, and
// nothing else: additionalProperties: false). The limits (not empty, not huge) don't fit in strict
// mode, which doesn't accept minLength or maxLength: Zod sets them, below.
const definition: Anthropic.Tool = {
  name: 'search_products',
  description:
    "Searches the shop's catalogue for products by name. Use it whenever the customer asks whether there's something, how much it costs or how many are left, before answering: you don't know what's in the shop unless you search. Search by one word of the name, in the singular (mug, hoodie, cap): it doesn't understand sentences or descriptions. Returns a list of at most 10 products, each with its id, its name, its price in euro cents (priceCents: 850 is €8.50) and the units left (stock: 0 means it's sold out). An empty list means there's none with that name.",
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "One word of the product's name, in the singular: mug, t-shirt, hoodie.",
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  strict: true,
};
// #endregion definition

// #region tool
// What the model sends is checked again, like any data that comes from outside (Phase 3): strict
// mode is a promise from the API, and the shop trusts nobody with its data.
const input = z.strictObject({
  query: z
    .string({ error: 'Must be a string' })
    .trim()
    .min(1, "Can't be empty")
    .max(100, 'At most 100 characters'),
});

export const searchProducts: AssistantTool = {
  definition,
  label: 'Searching products…',
  async run(data) {
    const { query } = input.parse(data);
    return searchProductsByName(query);
  },
};
// #endregion tool
