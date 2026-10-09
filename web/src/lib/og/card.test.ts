import { describe, expect, it } from 'vitest';
import { ogCard, ogFileLabel, ogImagePath, ogRouteParam } from './card';

describe('ogImagePath y ogRouteParam', () => {
  it('una imagen por página, con la ruta de la página', () => {
    expect(ogImagePath('fase-0/que-es-dns')).toBe('/og/fase-0/que-es-dns.png');
    expect(ogImagePath('en/phase-0/what-is-dns')).toBe('/og/en/phase-0/what-is-dns.png');
    expect(ogRouteParam('fase-0/que-es-dns')).toBe('fase-0/que-es-dns');
  });

  it('la portada en español es /og/index.png, venga como "index" o como ""', () => {
    expect(ogImagePath('')).toBe('/og/index.png');
    expect(ogImagePath('index')).toBe('/og/index.png');
    expect(ogImagePath('en')).toBe('/og/en.png');
  });
});

describe('ogFileLabel', () => {
  it('en una fase, la ruta sin el idioma, como un fichero', () => {
    expect(ogFileLabel('fase-0/que-es-dns', 'Qué es el DNS')).toBe('fase-0/que-es-dns.md');
    expect(ogFileLabel('en/phase-0/what-is-dns', 'What is DNS')).toBe('phase-0/what-is-dns.md');
  });

  it('las portadas, con el mismo nombre que en el explorador', () => {
    expect(ogFileLabel('', 'Backend desde cero')).toBe('inicio.md');
    expect(ogFileLabel('index', 'Backend desde cero')).toBe('inicio.md');
    expect(ogFileLabel('en', 'Backend from Scratch')).toBe('home.md');
  });

  it('las páginas raíz, con el nombre del explorador, que sale del título y no de la ruta', () => {
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

  it('mide 1200 × 630, el tamaño que piden las redes', () => {
    expect(card.props.style).toMatchObject({ width: 1200, height: 630 });
  });

  it('lleva el fichero, el título, el nombre de la web y el dominio', () => {
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

  it('un título largo usa una letra más pequeña para caber', () => {
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
