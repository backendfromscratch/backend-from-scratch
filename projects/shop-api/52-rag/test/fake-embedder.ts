// A fake embedder for the tests (Phase 11, lesson 5): the same role as the Claude API's fake model
// (fake-model.ts). The real one downloads about 135 MB and takes about 400 MB of memory; this one
// downloads nothing, answers at once and always gives the same vector for the same text, so the
// tests know which order to expect.
//
// How it computes the vector: a "bag of words". Each word of the text (lowercase, without accents
// and three letters or longer) falls, by its hash, into one of the vector's 384 positions, and adds
// 1 there. At the end, the vector is normalised (length 1), like the model's. Two texts that share
// words have nearby vectors; two that share none, distance 1. It understands nothing (to it, "cold"
// and "warm" don't look alike): it's only good for testing the code.
import { createHash } from 'node:crypto';
import { DIMENSIONS, type Embedder } from '../src/embeddings.ts';

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

export function fakeVector(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const word of words(text)) {
    const position = createHash('sha256').update(word).digest().readUInt32BE(0) % DIMENSIONS;
    vector[position]! += 1;
  }
  const length = Math.hypot(...vector);
  // With no word at all, any vector of length 1: one of zeros has no direction, and pgvector
  // couldn't measure its distance.
  if (length === 0) return vector.map((_, i) => (i === 0 ? 1 : 0));
  return vector.map((x) => x / length);
}

/** The fake embedder, which writes down each list of texts it's asked for. */
export function createFakeEmbedder(): Embedder & { requests: string[][] } {
  const requests: string[][] = [];
  return {
    requests,
    async vectors(texts) {
      requests.push(texts);
      return texts.map(fakeVector);
    },
  };
}
