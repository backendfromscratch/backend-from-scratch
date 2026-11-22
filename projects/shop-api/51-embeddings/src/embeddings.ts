// Embeddings (Phase 11, lesson 5). An embedding is a text turned into a vector: a list of numbers
// (here, 384) that says what it's about. A model computes it, trained so that two texts that mean
// the same give vectors pointing the same way, even if they share no word: "something for the
// cold" and "Thick wool scarf" end up close; "Cap for the sun", far away. How close two vectors are
// is the cosine distance (pgvector's <=> operator): 0 if they point exactly the same way, 1 if
// they have nothing to do with each other, 2 if they're opposite.
//
// The Claude API doesn't compute embeddings, so the shop uses a small model that runs on your own
// computer, with Transformers.js (@huggingface/transformers): free, with no other account or key,
// and no internet after downloading it the first time. It understands English and Spanish.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { config } from './config.ts';
import { db } from './db.ts';
import { log } from './log.ts';
import { products } from './schema.ts';

// #region embedder
// How many numbers each vector has: the ones the model gives. The products.embedding column is
// vector(384) (migration 014): with another model, giving another number, both would have to change.
export const DIMENSIONS = 384;

// The model, on Hugging Face (huggingface.co, where open models are published): a version of
// paraphrase-multilingual-MiniLM-L12-v2 prepared for Transformers.js. We chose it by measuring
// (2026-11-20): of the small ones that understand Spanish and English, the one that ranked the
// catalogue best.
export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// And its exact version: a commit of its repository on Hugging Face (the one of 2025-07-22, the
// latest when we chose it). Without it the newest one (main) is downloaded, and if someone changed
// its files, the new vectors would stop being comparable with the ones already stored, with nothing
// to warn about it. As with package.json's exact versions, changing it is a decision, and then all
// the vectors have to be computed again: npm run embeddings -- --all.
export const EMBEDDING_REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900';

// What the shop needs from an embedding model: texts in, one vector per text out, in the same
// order. With this, the rest of the shop doesn't know which model is behind it, and the tests put
// in a fake one (test/fake-embedder.ts) that downloads nothing and answers at once.
export interface Embedder {
  vectors(texts: string[]): Promise<number[][]>;
}
// #endregion embedder

// #region model-folder
// The files the model needs in q8. When it downloads them with an exact version, Transformers.js
// keeps them in folder/model/revision: with ./models, in
// ./models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/2c4055b…/.
export const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

// Where the model is loaded from: from that folder, if all its files are already there, or from
// Hugging Face, by its name, if one is missing (the first time, or if a download was cut halfway).
// Why not always by its name? Because then, even with the files already in the folder,
// Transformers.js (4.3.2) asks huggingface.co whether the model has a tokenizer, and it asks about
// the main version, not ours, which is the one stored: two requests every time it loads the
// model, and, on a server with no internet, an error. With a folder's path it asks nobody: it
// reads the files and that's it. So, after the first download, the shop needs no internet to load
// the model.
export function modelSource(folder: string): string {
  const downloaded = resolve(folder, EMBEDDING_MODEL, EMBEDDING_REVISION);
  const allThere = MODEL_FILES.every((file) => existsSync(join(downloaded, file)));
  return allThere ? downloaded : EMBEDDING_MODEL;
}
// #endregion model-folder

// #region local
// The real one, with Transformers.js. It loads nothing when created: the model (about 135 MB on
// disk and about 400 MB of memory) is loaded the first time someone asks for a vector, and the
// promise is kept, so the next requests reuse it, also the ones that arrive while it loads. A
// process that never searches by meaning pays nothing. folder: where the model's files go; if
// they aren't there, they're downloaded from Hugging Face (about 30 seconds the first time;
// after that, under a second, and with no internet).
export function createLocalEmbedder(folder: string): Embedder {
  let loading: Promise<FeatureExtractionPipeline> | undefined;

  async function load(): Promise<FeatureExtractionPipeline> {
    const start = performance.now();
    log.info(
      { model: EMBEDDING_MODEL, revision: EMBEDDING_REVISION, folder },
      'loading the embedding model',
    );
    // #region load-model
    // import() here, and not at the top: the library weighs too (onnxruntime, the engine that runs
    // the model), and this way it's only loaded if needed.
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = folder;
    // feature-extraction: from the text, its "features", a vector for each piece of a word.
    // modelSource: the folder with the files, with no internet, or, if one is missing, the name on
    // Hugging Face: then it downloads them into env.cacheDir, and next time they're there.
    // q8: the model's weights stored with 8 bits instead of 32, four times smaller and almost as
    // good.
    // revision: the exact version above, the one downloaded (from the folder it isn't needed: its
    // files are already that version's).
    const extractor = await pipeline('feature-extraction', modelSource(folder), {
      dtype: 'q8',
      revision: EMBEDDING_REVISION,
    });
    // #endregion load-model
    log.info({ ms: Math.round(performance.now() - start) }, 'embedding model loaded');
    return extractor;
  }

  return {
    async vectors(texts) {
      // If loading fails (no internet the first time, for example), it's forgotten: the next
      // request tries again, instead of getting the same error forever.
      loading ??= load().catch((error: unknown) => {
        loading = undefined;
        throw error;
      });
      const extractor = await loading;
      // pooling: 'mean': the average of each piece's vectors, a single vector per text.
      // normalize: true: all of length 1, so only where they point counts.
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist() as number[][];
    },
  };
}
// #endregion local

// #region the-shops
// The embedder the shop uses: the real one, with the configured folder, created the first time
// it's needed. useEmbedder swaps it for another: the tests do.
let embedder: Embedder | undefined;

export function useEmbedder(other: Embedder): void {
  embedder = other;
}

export function vectors(texts: string[]): Promise<number[][]> {
  embedder ??= createLocalEmbedder(config.MODELS_DIR);
  return embedder.vectors(texts);
}
// #endregion the-shops

// #region product-text
// What becomes a product's vector: its name and, if it has one, its description. The rest (the
// price, the stock) doesn't say what it's about.
export function productText(product: { name: string; description: string | null }): string {
  return product.description ? `${product.name}. ${product.description}` : product.name;
}
// #endregion product-text

// #region save-vectors
// Computes and saves the vector of the given products, all in a single call to the model. The
// worker uses it (the product that just changed: queue.ts) and so does npm run embeddings (the
// missing ones, 32 at a time). Returns how many it saved.
// While the model computes, someone may change the product again. So the UPDATE only writes if the
// name and the description are still the ones that were read: if not, the vector isn't its own
// any more, and the new change's job will compute the right one. (IS NOT DISTINCT FROM is the =
// that also works for NULL: NULL = NULL isn't true in SQL, but NULL IS NOT DISTINCT FROM NULL is.)
export async function saveVectors(ids: number[]): Promise<number> {
  const rows = await db
    .select({ id: products.id, name: products.name, description: products.description })
    .from(products)
    .where(inArray(products.id, ids));
  if (rows.length === 0) return 0;
  const list = await vectors(rows.map(productText));
  let saved = 0;
  for (const [i, row] of rows.entries()) {
    const changed = await db
      .update(products)
      .set({ embedding: list[i] })
      .where(
        and(
          eq(products.id, row.id),
          eq(products.name, row.name),
          sql`${products.description} IS NOT DISTINCT FROM ${row.description}`,
        ),
      )
      .returning({ id: products.id });
    saved += changed.length;
  }
  return saved;
}
// #endregion save-vectors

// #region fill
// What npm run embeddings does: the vectors of the products that have none (the ones from before
// migration 014, or the ones that changed with semantic search off), 32 at a time. all: true also
// computes the ones that already have one: after changing the model, for example.
export const BATCH = 32;

export async function fillVectors(all = false): Promise<number> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(all ? undefined : sql`${products.embedding} IS NULL`)
    .orderBy(products.id);
  let saved = 0;
  for (let from = 0; from < rows.length; from += BATCH) {
    const batch = rows.slice(from, from + BATCH).map((row) => row.id);
    saved += await saveVectors(batch);
  }
  return saved;
}
// #endregion fill
