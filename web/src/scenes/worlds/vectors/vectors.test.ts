import { describe, expect, it } from 'vitest';
import { strings, type Product } from './strings';
import { MEMORY_SCALE, nearest, ranks } from './vectors';

const langs = ['es', 'en'] as const;
const names = (products: readonly Product[]) => products.map((p) => p.name);

// The map is not to scale, but it must never contradict the text's tables: from each question, the
// products it draws nearest are the text's, in the text's order.
describe.each(langs)('the map of products, in %s', (lang) => {
  const t = strings[lang];

  it('has the catalogue’s 20 products, in its order', () => {
    expect(t.products).toHaveLength(20);
    expect(names(t.products).slice(0, t.catalog.names.length)).toEqual(t.catalog.names);
  });

  it('puts the text’s five nearest to «algo para el frío» first, in order, and the next one after', () => {
    const ranked = names(nearest(t.products, t.cold.at));
    expect(ranked.slice(0, 5)).toEqual(t.cold.nearest);
    expect(ranked[5]).toBe(t.cold.next);
  });

  it('puts the text’s five nearest to the one-word question first, in order', () => {
    const ranked = names(nearest(t.products, t.word.at));
    expect(ranked.slice(0, 5)).toEqual(t.word.nearest);
    // The hybrid search: the name's match first, then the five nearest without it.
    expect(ranked.filter((name) => name !== t.word.match).slice(0, 5)).toEqual(t.word.after);
  });

  it('leaves the Taza out of the five nearest in Spanish, and puts the Mug first in English', () => {
    const ranked = names(nearest(t.products, t.word.at));
    if (lang === 'es') expect(ranked.indexOf(t.word.match)).toBeGreaterThan(4);
    else expect(ranked[0]).toBe(t.word.match);
  });

  // Each scene labels only what it talks about; those labels must fit in the map and not cover each
  // other or another product. Sizes in board em: 0.72em type, monospace (0.6em a character).
  const box = (p: Product) => {
    const w = p.name.length * 0.432 + 0.36;
    const h = 0.97;
    const [x, y] = p.at;
    if (p.side === 'r') return [x + 0.48, y - h / 2, w, h] as const;
    if (p.side === 'l') return [x - 0.48 - w, y - h / 2, w, h] as const;
    if (p.side === 't') return [x - w / 2, y - 0.45 - h, w, h] as const;
    return [x - w / 2, y + 0.45, w, h] as const;
  };
  const overlap = (a: readonly number[], b: readonly number[]) =>
    a[0]! < b[0]! + b[2]! &&
    b[0]! < a[0]! + a[2]! &&
    a[1]! < b[1]! + b[3]! &&
    b[1]! < a[1]! + a[3]!;
  const find = (name: string) => t.products.find((p) => p.name === name)!;
  const scenes = {
    embed: [t.products[4]!.name],
    cold: [...t.cold.nearest, t.cold.next],
    word: [...new Set([...t.word.nearest, t.word.match, ...t.word.after])],
  };

  it.each(Object.entries(scenes))(
    'labels the %s scene’s products without covering anything',
    (_, set) => {
      for (const name of set) {
        const b = box(find(name));
        expect(b[0], `${name} inside`).toBeGreaterThanOrEqual(0);
        expect(b[1], `${name} inside`).toBeGreaterThanOrEqual(0);
        expect(b[0] + b[2], `${name} inside`).toBeLessThanOrEqual(16);
        expect(b[1] + b[3], `${name} inside`).toBeLessThanOrEqual(10);
        for (const other of t.products) {
          if (other.name === name) continue;
          const [x, y] = other.at;
          expect(overlap(b, [x - 0.3, y - 0.3, 0.6, 0.6]), `${name} over ${other.name}`).toBe(
            false,
          );
        }
        for (const other of set) {
          if (other <= name) continue;
          expect(overlap(b, box(find(other))), `${name} over ${other}`).toBe(false);
        }
      }
    },
  );
});

describe.each(langs)('the products table, in %s', (lang) => {
  const t = strings[lang];

  it('holds the five nearest to «algo para el frío», ranked as the text', () => {
    const order = ranks(t.table.rows);
    const byRank = t.table.rows
      .map(([name], i) => [order[i]!, name] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(byRank.map(([, name]) => name)).toEqual(t.cold.nearest);
  });
});

describe('docker stats', () => {
  it('draws the text’s figures, and its largest fits the bars', () => {
    expect(strings.es.memory.rows).toEqual([
      ['API', 193, 492],
      ['trabajador', 152, 532],
    ]);
    expect(strings.en.memory.rows).toEqual([
      ['API', 188, 566],
      ['worker', 151, 532],
    ]);
    for (const lang of langs)
      for (const [, before, after] of strings[lang].memory.rows)
        expect(Math.max(before, after)).toBeLessThanOrEqual(MEMORY_SCALE);
  });
});
