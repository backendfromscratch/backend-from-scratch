import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd } from './structured-data';

const SITE = 'https://backenddesdecero.com/';

describe('breadcrumbJsonLd', () => {
  it('is a schema.org BreadcrumbList with positions from 1 and absolute URLs', () => {
    const json = breadcrumbJsonLd(
      [
        { name: 'Backend desde cero', url: '/' },
        { name: 'Fase 0 · Cómo funciona internet', url: '/fase-0/' },
        { name: 'DNS', url: '/fase-0/que-es-dns/' },
      ],
      SITE,
    );
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Backend desde cero', item: SITE },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Fase 0 · Cómo funciona internet',
          item: `${SITE}fase-0/`,
        },
        { '@type': 'ListItem', position: 3, name: 'DNS', item: `${SITE}fase-0/que-es-dns/` },
      ],
    });
  });

  it('escapes «<» so no text can close the <script>', () => {
    const json = breadcrumbJsonLd([{ name: '</script><b>', url: '/' }], SITE);
    expect(json).not.toContain('<');
    expect(JSON.parse(json).itemListElement[0].name).toBe('</script><b>');
  });
});
