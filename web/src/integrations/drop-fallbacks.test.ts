import { describe, expect, it } from 'vitest';
import { keepInSitemap, removeFallbackCopies, type RemoveOps } from './drop-fallbacks';

describe('keepInSitemap', () => {
  const keep = keepInSitemap(new Set(['/en/fase-1/introducción/']));

  it('quita del sitemap las copias de respaldo, también con la ruta codificada, y las imágenes para redes', () => {
    expect(keep('https://backenddesdecero.com/en/fase-1/introducci%C3%B3n/')).toBe(false);
    expect(keep('https://backenddesdecero.com/og/index.png')).toBe(false);
    expect(keep('https://backenddesdecero.com/en/phase-1/')).toBe(true);
  });
});

describe('removeFallbackCopies', () => {
  /** Un sistema de ficheros de mentira: el conjunto de ficheros, y las carpetas borradas en orden. */
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

  it('borra el index.html de cada copia y su carpeta si queda vacía, de dentro hacia fuera', () => {
    const fs = fakeFs(['/dist/en/fase-0/index.html', '/dist/en/fase-0/que-es-dns/index.html']);
    removeFallbackCopies('/dist', ['/en/fase-0/', '/en/fase-0/que-es-dns/'], fs.ops);
    expect([...fs.existing]).toEqual([]);
    expect(fs.removedDirs).toEqual(['/dist/en/fase-0/que-es-dns', '/dist/en/fase-0']);
  });

  it('no borra páginas reales que estén dentro de la carpeta de una copia', () => {
    const fs = fakeFs(['/dist/en/index.html', '/dist/en/phase-0/index.html']);
    removeFallbackCopies('/dist', ['/en/'], fs.ops);
    expect([...fs.existing]).toEqual(['/dist/en/phase-0/index.html']);
    expect(fs.removedDirs).toEqual([]);
  });
});
