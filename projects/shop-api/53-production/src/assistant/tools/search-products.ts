// search_products (Phase 11, lesson 3): the catalogue, for the assistant. In lesson 3 it searched
// by name; since lesson 5 it searches by meaning ("something for the cold" finds the scarf and the
// gloves, even though they share no word), with the products' vectors and pgvector. With
// SEMANTIC_SEARCH=no, it still searches by name.
import type Anthropic from '@anthropic-ai/sdk';
import { and, asc, cosineDistance, ilike, isNotNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config.ts';
import { db } from '../../db.ts';
import { vectors } from '../../embeddings.ts';
import { products } from '../../schema.ts';
import type { AssistantTool } from './tool.ts';

// #region search
// How many products it returns at most: what a tool returns goes into the conversation, and every
// token of the conversation is paid for again in every round left.
export const MAX_PRODUCTS = 10;

// Of each product, just what's needed to answer: without the categories, which the model doesn't
// need. Since lesson 5, with its description (what it's about, so the model knows whether it suits
// the customer) and the distance to the query: from 0 (the same) to 2 (the opposite), or null if
// it wasn't measured (the search by name, or a product that has no vector yet).
export interface FoundProduct {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  distance: number | null;
}

const columns = {
  id: products.id,
  name: products.name,
  description: products.description,
  priceCents: products.priceCents,
  stock: products.stock,
};

// The products whose name contains the query, regardless of case: ILIKE, PostgreSQL's LIKE that
// doesn't tell "Mug" from "mug". Lesson 3's search, the one left with SEMANTIC_SEARCH=no.
export async function searchProductsByName(query: string): Promise<FoundProduct[]> {
  const rows = await db
    .select(columns)
    .from(products)
    .where(withTheName(query))
    .orderBy(asc(products.id))
    .limit(MAX_PRODUCTS);
  return rows.map((row) => ({ ...row, distance: null }));
}

const withTheName = (query: string) => ilike(products.name, `%${noWildcards(query)}%`);

// In a LIKE, % means "anything" and _ means "any one letter". What the model searches for is text,
// not a pattern: a \ goes before each of them (and before the \, which is the one that escapes), and
// they count as what they are. Without this, a query "%" would return the whole catalogue.
const noWildcards = (text: string) => text.replace(/[\\%_]/g, '\\$&');
// #endregion search

// #region by-meaning
// How many nearest neighbours the search by meaning returns: the k of "the k nearest". It always
// returns k, even if the last ones look nothing alike: vectors can't say "there's none", which is
// why the distance goes along, for the model to judge.
export const NEAREST = 5;

// The search by meaning, in three steps:
//   1. The query's vector, with the same model as the products' (the API only computes this one;
//      the worker computes the products').
//   2. The products that have the query in their name, as in lesson 3, first. An embedding model
//      understands sentences, but not always a lone word: measured on 2026-11-21, "mug" found the
//      Mug first, but in the Spanish shop «taza» left the Taza out of the five nearest. Putting the
//      two searches together (by words and by meaning) is called hybrid search. This way the
//      products that have no vector yet aren't lost either: if their name matches, they come out
//      here (with distance null, because it can't be measured).
//   3. Then, the NEAREST products whose vector is closest, without repeating the ones before, with
//      the cosine distance. In SQL:
//        SELECT …, embedding <=> '[0.021, -0.043, …]' AS distance FROM products
//        WHERE embedding IS NOT NULL AND id NOT IN (2) ORDER BY distance LIMIT 5
//      cosineDistance is pgvector's <=> written with Drizzle. ORDER BY that distance, with LIMIT,
//      is what the HNSW index (migration 014) can do without looking at the whole table.
export async function searchProductsByMeaning(query: string): Promise<FoundProduct[]> {
  // #region by-name-first
  const [vector] = await vectors([query]);
  // A product with no vector gives NULL, and Drizzle doesn't pass NULL to mapWith: it stays null.
  const distance = cosineDistance(products.embedding, vector!).mapWith(Number);
  const byName = await db
    .select({ ...columns, distance })
    .from(products)
    .where(withTheName(query))
    .orderBy(asc(products.id))
    .limit(MAX_PRODUCTS);
  const alreadyIn = byName.map((product) => product.id);
  // #endregion by-name-first
  // #region nearest
  const nearest = await db
    .select({ ...columns, distance })
    .from(products)
    .where(
      and(
        isNotNull(products.embedding),
        alreadyIn.length > 0 ? notInArray(products.id, alreadyIn) : undefined,
      ),
    )
    .orderBy(distance)
    .limit(NEAREST);
  // #endregion nearest
  // The distance, with three decimals: more tells the model nothing, and every digit is a token.
  return [...byName, ...nearest].map((product) => ({
    ...product,
    distance: product.distance === null ? null : Math.round(product.distance * 1000) / 1000,
  }));
}
// #endregion by-meaning

// #region search-catalogue
// The one the assistant and the MCP server (src/mcp.ts) use: a single way to search, with two
// doors. By meaning if semantic search is on; if not, by name.
export function searchCatalogue(query: string): Promise<FoundProduct[]> {
  return config.SEMANTIC_SEARCH === 'yes'
    ? searchProductsByMeaning(query)
    : searchProductsByName(query);
}
// #endregion search-catalogue

// #region definition
// What the model sees. The description isn't for people: it's what the model reads to decide when
// to use it, what to pass it and how to read what it returns. So it changes with the search: by
// meaning, the query can be a sentence ("something for the cold"); by name, it has to be a word of
// the name. strict: true makes the API only let the model call it with an input that matches the
// schema (an object with query, a string, and nothing else: additionalProperties: false). The
// limits (not empty, not huge) don't fit in strict mode, which doesn't accept minLength or
// maxLength: Zod sets them, below.
const WHAT_IT_RETURNS =
  "Each product has its id, its name, its description (or null), its price in euro cents (priceCents: 850 is €8.50) and the units left (stock: 0 means it's sold out).";

export const DESCRIPTION_BY_MEANING = `Searches the shop's catalogue for products by what the query means, not only by its words: it understands sentences and needs ("something for the cold", "a gift for someone who loves coffee") and names too (mug). Use it whenever the customer looks for something, asks whether there's something, how much it costs or how many are left, before answering: you don't know what's in the shop unless you search. Write the query with the customer's words, in their language. Returns first the products that have the query in their name, if any, and then the ${NEAREST} closest in meaning, from most to least alike. ${WHAT_IT_RETURNS} distance says how much it looks like the query: near 0, a lot; from 0.6 or 0.7 on, hardly at all (null: it couldn't be measured, but the name matches). It always returns products, even if none fits: look at the description and the distance before recommending one, and if none fits, say so.`;

export const DESCRIPTION_BY_NAME = `Searches the shop's catalogue for products by name. Use it whenever the customer asks whether there's something, how much it costs or how many are left, before answering: you don't know what's in the shop unless you search. Search by one word of the name, in the singular (mug, hoodie, cap): it doesn't understand sentences or descriptions. Returns a list of at most ${MAX_PRODUCTS} products. ${WHAT_IT_RETURNS} distance is always null. An empty list means there's none with that name.`;

// What it says about the query, in one search and the other. The MCP server uses the same ones.
export const QUERY_BY_MEANING =
  "What the customer is looking for, in their words (something for the cold) or a product's name (mug).";
export const QUERY_BY_NAME =
  "One word of the product's name, in the singular: mug, t-shirt, hoodie.";

// The configuration is read at startup: the definition is the one of the search there is.
const byMeaning = config.SEMANTIC_SEARCH === 'yes';

const definition: Anthropic.Tool = {
  name: 'search_products',
  description: byMeaning ? DESCRIPTION_BY_MEANING : DESCRIPTION_BY_NAME,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: byMeaning ? QUERY_BY_MEANING : QUERY_BY_NAME,
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
    return searchCatalogue(query);
  },
};
// #endregion tool
