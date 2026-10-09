import { describe, expect, it } from 'vitest';
import { localizedHref } from './links';

describe('localizedHref', () => {
  it('el español va en la raíz, sin prefijo', () => {
    expect(localizedHref('es', 'fase-0/que-es-dns')).toBe('/fase-0/que-es-dns/');
    expect(localizedHref('es')).toBe('/');
  });

  it('el inglés lleva /en/', () => {
    expect(localizedHref('en', 'phase-0')).toBe('/en/phase-0/');
    expect(localizedHref('en')).toBe('/en/');
    expect(localizedHref('en', '')).toBe('/en/');
  });

  it('tolera barras sobrantes al principio o al final', () => {
    expect(localizedHref('es', '/roadmap/')).toBe('/roadmap/');
  });
});
