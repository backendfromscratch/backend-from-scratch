import { describe, expect, it } from 'vitest';
import { keepInSitemap, removeFallbackCopies, type RemoveOps } from './drop-fallbacks';

describe('keepInSitemap', () => {
  const keep = keepInSitemap(new Set(['/en/fase-1/introducción/']));

  it('removes fallback copies from the sitemap, also with the encoded path, and the social images', () => {
    expect(keep('https://backenddesdecero.com/en/fase-1/introducci%C3%B3n/')).toBe(false);
    expect(keep('https://backenddesdecero.com/og/index.png')).toBe(false);
    expect(keep('https://backenddesdecero.com/en/phase-1/')).toBe(true);
  });
});

describe('removeFallbackCopies', () => {
  /** A fake file system: the set of files, and the removed folders in order. */
  function fakeFs(files: string[]) {
    const existing = new Set(files);
    const removedDirs: string[] = [];
    const ops: RemoveOps = {
      rmFile: (file) => void existing.delete(file),
      isEmptyDir: (dir) => ![...existing].some((file) => file.startsWith(`${dir}/`)),
      rmDir: (dir) => void removedDirs.push(dir),
    };
    return { existing, removedDirs, ops };
  }

  it("deletes each copy's index.html and its folder if it ends up empty, from the inside out", () => {
    const fs = fakeFs(['/dist/en/fase-0/index.html', '/dist/en/fase-0/que-es-dns/index.html']);
    removeFallbackCopies('/dist', ['/en/fase-0/', '/en/fase-0/que-es-dns/'], fs.ops);
    expect([...fs.existing]).toEqual([]);
    expect(fs.removedDirs).toEqual(['/dist/en/fase-0/que-es-dns', '/dist/en/fase-0']);
  });

  it("does not delete real pages that live inside a copy's folder", () => {
    const fs = fakeFs(['/dist/en/index.html', '/dist/en/phase-0/index.html']);
    removeFallbackCopies('/dist', ['/en/'], fs.ops);
    expect([...fs.existing]).toEqual(['/dist/en/phase-0/index.html']);
    expect(fs.removedDirs).toEqual([]);
  });
});
