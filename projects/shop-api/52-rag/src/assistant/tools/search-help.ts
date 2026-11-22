// search_help (Phase 11, lesson 6): the shop's help pages, for the assistant. A model knows nothing
// about this shop: asked how many days there are to return a product, it will answer what shops
// usually say, with full confidence, and it may not be this one's rule (that's a hallucination).
// With this tool, before answering it searches for the help chunks that are about the question
// (src/help.ts) and answers with them in front of it. That's RAG (Retrieval-Augmented Generation):
// retrieve (find the chunks), augment (put them in the conversation) and generate (the model answers
// with them). Done with a tool, it's the model that decides when a search is needed, and what for.
import type Anthropic from '@anthropic-ai/sdk';
import { asc, cosineDistance, desc, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config.ts';
import { db } from '../../db.ts';
import { vectors } from '../../embeddings.ts';
import { helpChunks } from '../../schema.ts';
import { type AssistantTool, originOf, SearchResults, type Source } from './tool.ts';

// #region search
// How many chunks it returns: the k of "the k nearest". With three short sections, the model almost
// always has what it needs, and the conversation doesn't grow much (every token is paid for again in
// every round left).
export const CHUNKS = 3;

// The longest a chunk's text can be when it's returned, in characters. The help's sections are short
// (the longest, about 500), but a new page could have a very long one, and it mustn't fill the
// conversation. The ones that go over are cut, with … at the end.
export const MAX_TEXT = 1500;

// What the search returns for each chunk: its page, its section, its text and the distance to the
// question (from 0, the same, to 2, the opposite; null if it searched by words, without measuring it).
export interface FoundChunk extends Source {
  text: string;
  distance: number | null;
}

const columns = {
  page: helpChunks.page,
  title: helpChunks.title,
  section: helpChunks.section,
  text: helpChunks.text,
};

const bound = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text);

// #region by-meaning
// By meaning, like search_products (lesson 5): the question's vector and the CHUNKS nearest chunks,
// with the HNSW index (migration 015):
//   SELECT …, embedding <=> '[0.021, …]' AS distance FROM help_chunks
//   WHERE embedding IS NOT NULL ORDER BY distance LIMIT 3
// It always returns three, even if the help says nothing about the question: the nearest neighbours
// of something always exist, even when they're far away. That's why the assistant's instructions
// ask it to read them and say "I don't know" if they don't answer.
export async function searchHelpByMeaning(question: string): Promise<FoundChunk[]> {
  const [vector] = await vectors([question]);
  const distance = cosineDistance(helpChunks.embedding, vector!).mapWith(Number);
  const rows = await db
    .select({ ...columns, distance })
    .from(helpChunks)
    .where(isNotNull(helpChunks.embedding))
    .orderBy(distance)
    .limit(CHUNKS);
  return rows.map((row) => ({
    ...row,
    text: bound(row.text),
    distance: Math.round(row.distance * 1000) / 1000,
  }));
}
// #endregion by-meaning

// By words, with PostgreSQL's full-text search: the one left with SEMANTIC_SEARCH=no, without a
// model. websearch_to_tsquery turns what's searched for into a query (a tsquery), like a web search
// engine: the words, reduced to their stem and without the ones that say nothing, joined with "and":
// "return product" is 'return' & 'product', and it only finds the sections that have both; with or
// between them, one is enough ("return or refund"). @@ says whether a row's tsvector (the search
// column, migration 015) matches the query, with the GIN index, and ts_rank scores how well: higher
// the more often the words appear. In SQL:
//   SELECT … FROM help_chunks WHERE search @@ websearch_to_tsquery('english', $1)
//   ORDER BY ts_rank(search, websearch_to_tsquery('english', $1)) DESC, id LIMIT 3
// It knows nothing about meanings: "can I return a mug?" asks for the words return and mug, and no
// section talks about mugs. In exchange, it needs no model, and an empty list means "there's nothing
// with those words".
export async function searchHelpByWords(question: string): Promise<FoundChunk[]> {
  const query = sql`websearch_to_tsquery('english', ${question})`;
  const rows = await db
    .select(columns)
    .from(helpChunks)
    .where(sql`${helpChunks.search} @@ ${query}`)
    .orderBy(desc(sql`ts_rank(${helpChunks.search}, ${query})`), asc(helpChunks.id))
    .limit(CHUNKS);
  return rows.map((row) => ({ ...row, text: bound(row.text), distance: null }));
}
// #endregion search

// #region search-help
// The one the assistant and the MCP server (src/mcp.ts) use: a single way to search the help, with
// two doors. By meaning if semantic search is on and the chunks have vectors; if not
// (SEMANTIC_SEARCH=no, or help loaded while it was off), by words.
export async function lookUpHelp(question: string): Promise<FoundChunk[]> {
  if (config.SEMANTIC_SEARCH === 'yes') {
    const nearest = await searchHelpByMeaning(question);
    if (nearest.length > 0) return nearest;
  }
  return searchHelpByWords(question);
}
// #endregion search-help

// #region definition
// What the model sees, which changes with the search, like search_products' one: by meaning, the
// question can be a sentence; by words, better two or three keywords. In both cases, in English: the
// pages are in English, and the word search only understands that language (the embedding model
// understands both, but it does better with the same language).
const TOPICS =
  'shipping and what each order status means, cancellations and returns, payments and the account';
const WHEN = `Use it whenever the customer asks how something in the shop works (delivery times, costs, returns, cancellations, payments, their account), before answering: you only know the shop's rules from here. Write in English, the help's language, even if the customer writes in another one.`;

export const DESCRIPTION_BY_MEANING = `Searches the shop's help pages (${TOPICS}) for the sections that are about a question, by what it means, not only by its words. ${WHEN} Returns the ${CHUNKS} sections most like the question, each with its page and its title. It always returns ${CHUNKS}, even if none answers the question: read them before using them, and if they don't say what the customer asks, the help doesn't say it.`;

export const DESCRIPTION_BY_WORDS = `Searches the shop's help pages (${TOPICS}) for the sections that contain some words. ${WHEN} Write two or three keywords, without articles (return product, delivery time): it only finds the sections that have all of them; with or between two words, one is enough (return or refund). Returns at most ${CHUNKS} sections, each with its page and its title, the ones with more of those words first. If there are none, try other words before saying the help doesn't say it.`;

export const QUESTION_BY_MEANING = "The customer's question, in English: can I return a mug?";
export const QUESTION_BY_WORDS = 'Two or three keywords, in English: return product.';

const byMeaning = config.SEMANTIC_SEARCH === 'yes';

const definition: Anthropic.Tool = {
  name: 'search_help',
  description: byMeaning ? DESCRIPTION_BY_MEANING : DESCRIPTION_BY_WORDS,
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: byMeaning ? QUESTION_BY_MEANING : QUESTION_BY_WORDS,
      },
    },
    required: ['question'],
    additionalProperties: false,
  },
  strict: true,
};
// #endregion definition

// #region tool
const input = z.strictObject({
  question: z
    .string({ error: 'Must be a string' })
    .trim()
    .min(1, "Can't be empty")
    .max(300, 'At most 300 characters'),
});

// If it finds nothing (by words it can happen; by meaning, only if the table is empty), a sentence:
// the API asks for a result with no results to be a text that says so.
export const NO_RESULTS = "The shop's help has no section about that.";

// #region as-search-results
// Each chunk, as an API search_result block: source is where it comes from (here, the page's file),
// title its title (the page's and the section's), both from originOf, and content its text. With
// citations: { enabled: true }, the model cites which block each sentence comes from. The API asks
// for every search_result in a request to have the same citation setting: here, always on.
export function asResults(chunks: FoundChunk[]): SearchResults {
  return new SearchResults(
    chunks.map((chunk) => {
      const { source, title } = originOf(chunk);
      return {
        type: 'search_result',
        source,
        title,
        content: [{ type: 'text', text: chunk.text }],
        citations: { enabled: true },
      };
    }),
    chunks.map(({ page, title, section }) => ({ page, title, section })),
  );
}
// #endregion as-search-results

export const searchHelp: AssistantTool = {
  definition,
  label: 'Searching the help…',
  async run(data) {
    const { question } = input.parse(data);
    const chunks = await lookUpHelp(question);
    return chunks.length === 0 ? NO_RESULTS : asResults(chunks);
  },
};
// #endregion tool
