// Where the shop loads the embedding model from (Phase 11, lesson 5, src/embeddings.ts): from its
// folder, without asking Hugging Face, when all its files are already there; by its name, which
// downloads it, when one is missing. Without the real model: here the files are fake, empty,
// because all that counts is that they're there. That the real one loads and computes vectors is
// checked by npm run check-embeddings, which isn't part of npm test.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import {
  EMBEDDING_MODEL,
  EMBEDDING_REVISION,
  MODEL_FILES,
  modelSource,
} from '../src/embeddings.ts';

// A new models folder for each test, with the given files inside a version's folder (ours, unless
// told otherwise).
const folders: string[] = [];
after(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

async function folderWith(files: string[], revision = EMBEDDING_REVISION) {
  const folder = await mkdtemp(join(tmpdir(), 'models-'));
  folders.push(folder);
  for (const file of files) {
    const path = join(folder, EMBEDDING_MODEL, revision, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '');
  }
  return folder;
}

test('with an empty folder, by its name: it downloads it', async () => {
  const folder = await folderWith([]);
  assert.equal(modelSource(folder), EMBEDDING_MODEL);
});

test("with all the files, from its version's folder: with no internet", async () => {
  const folder = await folderWith(MODEL_FILES);
  assert.equal(modelSource(folder), join(folder, EMBEDDING_MODEL, EMBEDDING_REVISION));
});

test('if one is missing, by its name: a download cut halfway gets finished', async () => {
  for (const missing of MODEL_FILES) {
    const folder = await folderWith(MODEL_FILES.filter((file) => file !== missing));
    assert.equal(modelSource(folder), EMBEDDING_MODEL, `without ${missing}`);
  }
});

test("the main version's files don't count", async () => {
  // Transformers.js keeps main's in folder/model, with no version folder.
  const folder = await folderWith(MODEL_FILES, '');
  assert.equal(modelSource(folder), EMBEDDING_MODEL);
});
