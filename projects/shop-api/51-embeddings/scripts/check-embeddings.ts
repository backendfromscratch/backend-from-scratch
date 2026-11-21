// Tries the real embedding model (Phase 11, lesson 5), with no database. Run it with:
//   npm run check-embeddings
// npm test never loads it (the tests use a fake one, test/fake-embedder.ts): this script checks that
// the real one ranks the practice catalogue well. It computes the vectors of the products in
// db/seed.sql and of a few questions, and shows the nearest to each one. It fails (exits with 1)
// if, for "something for the cold", the first three aren't warm clothes, ahead of every summer
// thing, or if, once loaded, its files aren't where the shop looks for them to load it with no
// internet. It uses the tests' configuration (test/.env): all it needs is MODELS_DIR, which isn't
// there (./models, the project's folder). The first time it downloads the model, about 135 MB.
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.ts';
import {
  createLocalEmbedder,
  EMBEDDING_MODEL,
  modelSource,
  productText,
} from '../src/embeddings.ts';

// #region catalogue
// The practice products, read from db/seed.sql: one line per product, like
//   ('Scarf', 'Long, soft and cosy scarf of thick wool…', 2200, 30),
const sql = await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8');
const catalogue = [...sql.matchAll(/^ {2}\('([^']+)', '([^']+)', \d+, \d+\)[,;]$/gm)].map(
  ([, name, description]) => ({ name: name!, description: description! }),
);

// The warm clothes, the ones "something for the cold" has to find first.
const WARM = ['Scarf', 'Gloves', 'Wool hat', 'Hoodie', 'Blanket'];
for (const name of WARM) {
  if (!catalogue.some((product) => product.name === name)) {
    console.error(`${name} isn't in db/seed.sql: change this script's list`);
    process.exit(1);
  }
}
// #endregion catalogue

// #region measure
// #region distance
// Cosine distance between two vectors of length 1: 1 minus their dot product (the sum of
// multiplying them number by number). The same as pgvector's <=> computes.
const distance = (a: number[], b: number[]) => 1 - a.reduce((sum, x, i) => sum + x * b[i]!, 0);
// #endregion distance

const embedder = createLocalEmbedder(config.MODELS_DIR);
const memoryBefore = process.memoryUsage().rss;

let start = performance.now();
const vectors = await embedder.vectors(catalogue.map(productText));
const loadAndCatalogue = performance.now() - start;

// Again, already loaded: what computing the vectors costs, without the loading.
start = performance.now();
await embedder.vectors(catalogue.map(productText));
const catalogueOnly = performance.now() - start;
const memoryAfter = process.memoryUsage().rss;

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
console.log(`Model: ${config.MODELS_DIR}`);
console.log(
  `Loading the model and ${catalogue.length} vectors: ${(loadAndCatalogue / 1000).toFixed(1)} s; ` +
    `the ${catalogue.length} again, already loaded: ${Math.round(catalogueOnly)} ms ` +
    `(${Math.round(catalogueOnly / catalogue.length)} ms each)`,
);
console.log(
  `Process memory (RSS): ${mb(memoryBefore)} MB before, ${mb(memoryAfter)} MB with the model`,
);
// #endregion measure

// Once loaded, its files have to be where the shop looks for them (modelSource, in
// src/embeddings.ts): otherwise every load would ask Hugging Face again, and with no internet it
// wouldn't load. It would happen, for instance, with another version of Transformers.js that kept
// them somewhere else.
if (modelSource(config.MODELS_DIR) === EMBEDDING_MODEL) {
  console.error(
    `Wrong: the model's files aren't in ${config.MODELS_DIR}, where the shop looks for them`,
  );
  process.exit(1);
}

// #region questions
async function nearest(question: string) {
  const [vector] = await embedder.vectors([question]);
  return catalogue
    .map((product, i) => ({ name: product.name, distance: distance(vector!, vectors[i]!) }))
    .toSorted((a, b) => a.distance - b.distance);
}

const questions = [
  'something for the cold',
  'a gift for someone who loves coffee',
  'something for the summer',
  'mug',
];
let cold: { name: string; distance: number }[] = [];
for (const question of questions) {
  const order = await nearest(question);
  if (question === questions[0]) cold = order;
  console.log(`\n"${question}"`);
  for (const { name, distance } of order.slice(0, 5)) {
    console.log(`  ${distance.toFixed(3)}  ${name}`);
  }
}
// #endregion questions

// #region check
// What it has to meet: for "something for the cold", the first three, warm clothes (and so ahead
// of every summer thing). We don't ask for all the warm clothes to come before all the summer
// things: the model understands what a sentence is about (here, clothes and the temperature), but
// not always which way.
const firstThree = cold.slice(0, 3).map((product) => product.name);
const notWarm = firstThree.filter((name) => !WARM.includes(name));
if (notWarm.length > 0) {
  console.error(
    `\nWrong: for "something for the cold", among the first three (${firstThree.join(', ')}) ` +
      `there's something that isn't warm clothing: ${notWarm.join(', ')}`,
  );
  process.exit(1);
}
console.log('\nGood: for "something for the cold", the first three are warm clothes');
// #endregion check
