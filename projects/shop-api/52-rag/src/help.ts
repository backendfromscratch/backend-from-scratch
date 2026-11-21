// The shop's help pages (Phase 11, lesson 6): shipping, returns, payments and the account, each one
// in a Markdown file in the help/ folder, written for people. A model knows nothing about this shop
// (neither its delivery times nor its rules), so the assistant looks them up with its search_help
// tool before answering: that's RAG (src/assistant/tools/search-help.ts). For that, the pages are
// split into chunks, one per section, and each chunk is saved in the help_chunks table (migration
// 015) with its vector, like a product. npm run help does it (scripts/help.ts), and so does the
// worker the first time the shop starts.
//
// Why in chunks, and not whole pages? Because what's searched for is the chunk that's about the
// question: a vector sums up a whole text, and the vector of a page that talks about four things
// doesn't look much like any of them. And because what's returned goes into the conversation, and
// every token is paid for: better the section that answers than the whole page.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { config } from './config.ts';
import { db } from './db.ts';
import { BATCH, vectors } from './embeddings.ts';
import { helpChunks } from './schema.ts';

// #region split
// A chunk of a page: its page (page, the file's name without .md; title, the page's title), its
// section and its text.
export interface Chunk {
  page: string;
  title: string;
  section: string;
  text: string;
}

// Splits a page into chunks at its section headings (the lines that start with "## "). The page's
// title is its "# " line; if it has none, the file's name. Whatever is between the page's title and
// the first section, if there's anything, is another chunk, with the page's title as its section.
// Each chunk carries both titles, because a section's text usually counts on them: "You have 30
// days from when you receive your order…" doesn't say for what, and "Cancellations and returns:
// Returning a product" does.
export function splitPage(page: string, markdown: string): Chunk[] {
  // split with a regular expression cuts the text at every "## " at the start of a line (the m makes
  // ^ the start of each line, not just of the text). The first piece is what comes before the first
  // section. \r\n is Windows' line break: it's turned into \n.
  const [header = '', ...sections] = markdown.replaceAll('\r\n', '\n').split(/^## +/m);
  const title = /^# +(.+)$/m.exec(header)?.[1]?.trim() ?? page;
  const pieces = [
    { section: title, text: header.replace(/^# +.+$/m, '') },
    ...sections.map((section) => {
      const [first = '', ...rest] = section.split('\n');
      return { section: first.trim(), text: rest.join('\n') };
    }),
  ];
  return pieces
    .map(({ section, text }) => ({ page, title, section, text: clean(text) }))
    .filter((chunk) => chunk.text !== '');
}

// The text, without Markdown's bold marks (**paid** becomes paid): the assistant answers in plain
// text, and there's no need to show it asterisks. Without the extra blank lines.
const clean = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// A chunk, better short. The embedding model (paraphrase-multilingual-MiniLM-L12-v2) was trained
// with texts of up to 128 tokens (max_seq_length, in its sentence_bert_config.json). The ONNX
// version the shop uses accepts up to 512 (max_position_embeddings), but beyond 128 it works
// outside what it learned. The help's longest chunk has 118 (measured on 2026-11-21).
// #region chunk-text
// What becomes a chunk's vector: its two titles and its text, like a product's name and description
// (productText, in embeddings.ts).
export const chunkText = ({ title, section, text }: Chunk) => `${title}: ${section}. ${text}`;
// #endregion chunk-text
// #endregion split

// #region read
// The pages' folder: help/, at the project's root (in the image, /app/help).
export const HELP_FOLDER = join(import.meta.dirname, '..', 'help');

// Every page in the folder (the .md files), in alphabetical order, in chunks.
export async function readHelp(folder = HELP_FOLDER): Promise<Chunk[]> {
  const files = (await readdir(folder)).filter((file) => file.endsWith('.md')).sort();
  const chunks: Chunk[] = [];
  for (const file of files) {
    const markdown = await readFile(join(folder, file), 'utf8');
    chunks.push(...splitPage(file.slice(0, -'.md'.length), markdown));
  }
  return chunks;
}
// #endregion read

// #region load
// What npm run help does: it reads the pages, computes each chunk's vector (BATCH at a time, like the
// products' ones) and swaps whatever is in the table for the new chunks. It can run as many times as
// needed (after changing a page, for example): it always leaves the table matching the pages. With
// SEMANTIC_SEARCH=no it saves the chunks without a vector: search_help then searches by words, and
// the model isn't needed. It returns how many chunks it saved and whether they carry vectors.
export interface Load {
  chunks: number;
  withVectors: boolean;
}

export async function loadHelp(folder = HELP_FOLDER): Promise<Load> {
  const chunks = await readHelp(folder);
  // An empty folder (or the wrong one) doesn't wipe the help that's there.
  if (chunks.length === 0) throw new Error(`There are no help pages in ${folder}`);

  // The vectors, before the transaction: the model can take a while (the first time, about 30
  // seconds, with the download), and a transaction open all that time would lock the table.
  const withVectors = config.SEMANTIC_SEARCH === 'yes';
  const list: number[][] = [];
  if (withVectors) {
    for (let from = 0; from < chunks.length; from += BATCH) {
      const batch = chunks.slice(from, from + BATCH);
      list.push(...(await vectors(batch.map(chunkText))));
    }
  }

  // Deleting the old ones and saving the new ones, in a transaction: whoever searches meanwhile sees
  // the old ones until the COMMIT, and the new ones after it; never the table empty or half done.
  // LOCK TABLE … IN EXCLUSIVE MODE lets the table be read, but not written, until the end of the
  // transaction: if two loads coincide (the worker when it starts and npm run help, say), the second
  // waits for the first to finish, deletes its rows and saves its own. Without the lock, the second
  // wouldn't see the rows the first hadn't committed yet, wouldn't delete them, and the table would
  // end up with the chunks twice.
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${helpChunks} IN EXCLUSIVE MODE`);
    await tx.delete(helpChunks);
    await tx
      .insert(helpChunks)
      .values(chunks.map((chunk, i) => ({ ...chunk, embedding: list[i] ?? null })));
  });
  return { chunks: chunks.length, withVectors };
}

// What the worker does when it starts (scripts/worker.ts): load the help only if the table is empty,
// the first time the shop starts (or after docker compose down -v). That way, with Docker Compose,
// the assistant has the help without anyone doing anything. If there are chunks already, it leaves
// them alone: after changing a page, npm run help. It returns the load, or undefined if it wasn't
// needed.
export async function loadHelpIfMissing(): Promise<Load | undefined> {
  const [any] = await db.select({ id: helpChunks.id }).from(helpChunks).limit(1);
  return any ? undefined : loadHelp();
}
// #endregion load
