import { describe, expect, it } from 'vitest';
import { localizedHref } from './links';

describe('localizedHref', () => {
  it('Spanish goes at the root, without a prefix', () => {
    expect(localizedHref('es', 'fase-0/que-es-dns')).toBe('/fase-0/que-es-dns/');
    expect(localizedHref('es')).toBe('/');
  });

  it('English gets /en/', () => {
    expect(localizedHref('en', 'phase-0')).toBe('/en/phase-0/');
    expect(localizedHref('en')).toBe('/en/');
    expect(localizedHref('en', '')).toBe('/en/');
  });

  it('tolerates extra slashes at the start or end', () => {
    expect(localizedHref('es', '/roadmap/')).toBe('/roadmap/');
  });
});
