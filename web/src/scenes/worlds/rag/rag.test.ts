import { describe, expect, it } from 'vitest';
import { dropped, sources, tile, TOP } from './rag';
import { strings } from './strings';

const langs = ['es', 'en'] as const;

// The scenes draw the text's own searches: the rows they light must be the help's sections, and
// what a threshold or k = 1 would do must be what the text says it does.
describe.each(langs)('the rag world, in %s', (lang) => {
  const t = strings[lang];

  it('has four pages of four sections, and the returns page is the doc', () => {
    expect(t.pages).toHaveLength(4);
    expect(t.doc.file).toBe(`${t.pages[t.doc.page]!.name}.md`);
    expect(t.pages[t.doc.page]!.sections).toContain(t.thirty);
  });

  it('lights a tile of the table for every row of every search', () => {
    const tiles = Object.values(t.lists).flatMap(({ rows }) =>
      rows.map(([section]) => tile(lang, section)),
    );
    for (const id of tiles) expect(id).toMatch(/^#rg-tile-([1-9]|1[0-6])$/);
    expect(() => tile(lang, 'Tienda física')).toThrow();
  });

  it('fits every search in the top-k’s rows', () => {
    for (const { rows } of Object.values(t.lists)) expect(rows.length).toBeLessThanOrEqual(TOP);
  });

  it('puts the 30 days below the first row of the mug question, so k = 1 would miss it', () => {
    const at = t.lists.mug.rows.findIndex(([section]) => section === t.thirty);
    expect(at).toBe(lang === 'es' ? 2 : 1);
  });

  it('drops the good chunk and keeps the useless one with the text’s threshold', () => {
    const distance = (list: 'mug' | 'physical', section: string) =>
      t.lists[list].rows.find(([name]) => name === section)![1];
    expect(dropped(distance('mug', t.thirty), t.threshold)).toBe(true);
    expect(dropped(t.lists.physical.rows[0]![1], t.threshold)).toBe(false);
    expect(dropped('', t.threshold)).toBe(false);
  });

  it('lists the cited section as the sources, and none for an uncited answer', () => {
    expect(sources(lang, { rgSources: 'cited' })).toBe(`["${t.thirty}"]`);
    expect(sources(lang, { rgSources: 'none' })).toBe('[]');
    expect(sources(lang, { rgSources: '' })).toBe('');
  });

  it('finds nothing by words for the whole question, and something for the keywords', () => {
    expect(t.lists.sentence.rows).toHaveLength(0);
    expect(t.lists.keywords.rows.map(([section]) => section)).toContain(t.thirty);
  });
});
