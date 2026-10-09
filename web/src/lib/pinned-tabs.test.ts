import { describe, expect, it } from 'vitest';
import { pinnedTabs, tabStrip } from './pinned-tabs';

describe('pinnedTabs', () => {
  it('playgrounds y glosario, en ese orden y en el idioma de la página', () => {
    expect(pinnedTabs('es', '/fase-0/que-es-dns/').map(({ id, href }) => [id, href])).toEqual([
      ['playgrounds', '/playgrounds/'],
      ['glossary', '/glossary/'],
    ]);
    expect(pinnedTabs('en', '/en/phase-0/what-is-dns/').map(({ href }) => href)).toEqual([
      '/en/playgrounds/',
      '/en/glossary/',
    ]);
  });

  it('en una lección, ninguna es la actual', () => {
    expect(pinnedTabs('es', '/fase-0/que-es-dns/').some((tab) => tab.current)).toBe(false);
  });

  it('en el glosario o en los playgrounds, su pestaña es la actual', () => {
    expect(pinnedTabs('es', '/glossary/').map((tab) => tab.current)).toEqual([false, true]);
    expect(pinnedTabs('en', '/en/playgrounds/').map((tab) => tab.current)).toEqual([true, false]);
  });

  it('con o sin la barra final', () => {
    expect(pinnedTabs('es', '/glossary').map((tab) => tab.current)).toEqual([false, true]);
  });
});

describe('tabStrip', () => {
  it('la pestaña de la página abierta va la primera; después, las fijadas', () => {
    expect(tabStrip('es', '/fase-0/que-es-dns/').map((tab) => tab.kind)).toEqual([
      'page',
      'pinned',
      'pinned',
    ]);
  });

  it('también en la portada y en el temario, que no tienen pestaña fijada', () => {
    expect(tabStrip('es', '/')[0]?.kind).toBe('page');
    expect(tabStrip('en', '/en/roadmap/')[0]?.kind).toBe('page');
  });

  it('en el glosario o en los playgrounds, la primera sigue: la última página abierta, sin repetir la fijada', () => {
    const strip = tabStrip('es', '/glossary/');
    expect(strip.map((tab) => tab.kind)).toEqual(['last', 'pinned', 'pinned']);
    expect(strip.find((tab) => tab.kind === 'pinned' && tab.current)).toMatchObject({
      id: 'glossary',
    });
  });
});
