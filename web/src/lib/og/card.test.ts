import { describe, expect, it } from 'vitest';
import { ogCard, ogFileLabel, ogImagePath, ogRouteParam } from './card';

describe('ogImagePath y ogRouteParam', () => {
  it('one image per page, with the page path', () => {
    expect(ogImagePath('fase-0/que-es-dns')).toBe('/og/fase-0/que-es-dns.png');
    expect(ogImagePath('en/phase-0/what-is-dns')).toBe('/og/en/phase-0/what-is-dns.png');
    expect(ogRouteParam('fase-0/que-es-dns')).toBe('fase-0/que-es-dns');
  });

  it('the Spanish home page is /og/index.png, whether it comes as "index" or ""', () => {
    expect(ogImagePath('')).toBe('/og/index.png');
    expect(ogImagePath('index')).toBe('/og/index.png');
    expect(ogImagePath('en')).toBe('/og/en.png');
  });
});

describe('ogFileLabel', () => {
  it('in a phase, the path without the language, as a file', () => {
    expect(ogFileLabel('fase-0/que-es-dns', 'Qué es el DNS')).toBe('fase-0/que-es-dns.md');
    expect(ogFileLabel('en/phase-0/what-is-dns', 'What is DNS')).toBe('phase-0/what-is-dns.md');
  });

  it('the home pages, with the same name as in the explorer', () => {
    expect(ogFileLabel('', 'Backend desde cero')).toBe('inicio.md');
    expect(ogFileLabel('index', 'Backend desde cero')).toBe('inicio.md');
    expect(ogFileLabel('en', 'Backend from Scratch')).toBe('home.md');
  });

  it('the root pages, with the explorer name, which comes from the title and not from the path', () => {
    expect(ogFileLabel('roadmap', 'Temario')).toBe('temario.md');
    expect(ogFileLabel('glossary', 'Glosario')).toBe('glosario.md');
    expect(ogFileLabel('en/roadmap', 'Roadmap')).toBe('roadmap.md');
  });
});

describe('ogCard', () => {
  const card = ogCard({
    title: 'Qué es el DNS',
    fileLabel: 'fase-0/que-es-dns.md',
    siteTitle: 'Backend desde cero',
    domain: 'backenddesdecero.com',
  });

  it('measures 1200 × 630, the size social networks ask for', () => {
    expect(card.props.style).toMatchObject({ width: 1200, height: 630 });
  });

  it('carries the file, the title, the site name and the domain', () => {
    const json = JSON.stringify(card);
    for (const text of [
      'Qué es el DNS',
      'fase-0/que-es-dns.md',
      'Backend desde cero',
      'backenddesdecero.com',
    ]) {
      expect(json).toContain(text);
    }
  });

  it('a long title uses a smaller font to fit', () => {
    const long = ogCard({
      title: 'Qué pasa cuando escribes una URL en el navegador',
      fileLabel: 'x.md',
      siteTitle: 's',
      domain: 'd',
    });
    expect(JSON.stringify(long)).toContain('"fontSize":60');
    expect(JSON.stringify(card)).toContain('"fontSize":76');
  });
});
