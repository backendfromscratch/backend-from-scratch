// Computes the vectors of the products that have none (Phase 11, lesson 5). Run it with:
//   npm run embeddings            the missing ones: the ones from before migration 014, or the ones
//                                 that changed with SEMANTIC_SEARCH=no
//   npm run embeddings -- --all   all of them again: after changing the model, for example
// With Docker Compose, inside the worker, which has the models volume:
//   docker compose exec worker node scripts/embeddings.ts
// It does the same as the worker with each product that changes (saveVectors, in
// src/embeddings.ts), 32 at a time. The first time it downloads the model (about 135 MB).
import { parseArgs } from 'node:util';
import { config } from '../src/config.ts';
import { pool } from '../src/db.ts';
import { fillVectors } from '../src/embeddings.ts';

let all: boolean;
try {
  all = parseArgs({ options: { all: { type: 'boolean' } }, strict: true }).values.all === true;
} catch (error) {
  console.error(`Invalid argument: ${(error as Error).message}`);
  console.error('Usage: npm run embeddings, or npm run embeddings -- --all');
  process.exit(1);
}

// With semantic search off, the shop doesn't use the vectors: computing them would only take
// memory (the model) and time.
if (config.SEMANTIC_SEARCH === 'no') {
  console.error("SEMANTIC_SEARCH=no: the shop doesn't use the vectors. Turn it on first (yes).");
  process.exit(1);
}

try {
  const start = performance.now();
  const saved = await fillVectors(all);
  const seconds = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`Vectors computed: ${saved}, in ${seconds} s`);
} finally {
  await pool.end();
}
