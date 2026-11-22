// Loads the help pages into the database (Phase 11, lesson 6). Run it with:
//   npm run help
// It reads the files in help/, splits them into chunks (one per section), computes each one's vector
// and swaps the ones in the help_chunks table for these, in a transaction (src/help.ts). Run it again
// after changing a page, or after turning semantic search on: with SEMANTIC_SEARCH=no it saves the
// chunks without a vector, and search_help searches by words.
// With Docker Compose, inside the worker, which has the models volume:
//   docker compose exec worker node scripts/help.ts
// (the worker already loads it by itself when it starts, if the table is empty). The first time with
// semantic search on, it downloads the model (about 135 MB).
import { pool } from '../src/db.ts';
import { loadHelp } from '../src/help.ts';

try {
  const start = performance.now();
  const { chunks, withVectors } = await loadHelp();
  const seconds = ((performance.now() - start) / 1000).toFixed(1);
  console.log(
    `Help loaded: ${chunks} chunks, ${withVectors ? 'with' : 'without'} vectors, in ${seconds} s`,
  );
  if (!withVectors) {
    console.log('With SEMANTIC_SEARCH=no, search_help searches by words.');
  }
} catch (error) {
  console.error(`Couldn't load the help: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
