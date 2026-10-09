import { describe, expect, it } from 'vitest';
import { pinnedTabs, tabStrip } from './pinned-tabs';

describe('pinnedTabs', () => {
  it('playgrounds and glossary, in that order and in the language of the page', () => {
    expect(pinnedTabs('es', '/fase-0/que-es-dns/').map(({ id, href }) => [id, href])).toEqual([
      ['playgrounds', '/playgrounds/'],
      ['glossary', '/glossary/'],
    ]);
    expect(pinnedTabs('en', '/en/phase-0/what-is-dns/').map(({ href }) => href)).toEqual([
      '/en/playgrounds/',
      '/en/glossary/',
    ]);
  });

  it('in a lesson, none is the current one', () => {
    expect(pinnedTabs('es', '/fase-0/que-es-dns/').some((tab) => tab.current)).toBe(false);
  });

  it('in the glossary or the playgrounds, their tab is the current one', () => {
    expect(pinnedTabs('es', '/glossary/').map((tab) => tab.current)).toEqual([false, true]);
    expect(pinnedTabs('en', '/en/playgrounds/').map((tab) => tab.current)).toEqual([true, false]);
  });

  it('with or without the trailing slash', () => {
    expect(pinnedTabs('es', '/glossary').map((tab) => tab.current)).toEqual([false, true]);
  });
});

describe('tabStrip', () => {
  it('the tab of the open page comes first; then the pinned ones', () => {
    expect(tabStrip('es', '/fase-0/que-es-dns/').map((tab) => tab.kind)).toEqual([
      'page',
      'pinned',
      'pinned',
    ]);
  });

  it('also on the home page and the syllabus, which have no pinned tab', () => {
    expect(tabStrip('es', '/')[0]?.kind).toBe('page');
    expect(tabStrip('en', '/en/roadmap/')[0]?.kind).toBe('page');
  });

  it('in the glossary or the playgrounds, the first one stays: the last open page, without repeating the pinned one', () => {
    const strip = tabStrip('es', '/glossary/');
    expect(strip.map((tab) => tab.kind)).toEqual(['last', 'pinned', 'pinned']);
    expect(strip.find((tab) => tab.kind === 'pinned' && tab.current)).toMatchObject({
      id: 'glossary',
    });
  });
});
