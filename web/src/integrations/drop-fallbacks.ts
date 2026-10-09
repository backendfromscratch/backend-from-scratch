/**
 * Borra del build las copias de respaldo que Starlight genera en /en/ para cada página en español
 * cuya ruta no existe en inglés (ver fallbackUrls). Va ANTES de Starlight en `integrations`: así
 * borra los ficheros antes de que Pagefind indexe el build.
 */
import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idFromContentPath } from '../lib/translations';

/** Los ids de las entradas de una carpeta de contenido, como los genera Astro. */
export function listContentIds(docsDir: string): string[] {
  return fs
    .readdirSync(docsDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => idFromContentPath(file.split(path.sep).join('/')));
}

/** Las operaciones de ficheros que hacen falta, para poder probarlo sin tocar el disco. */
export interface RemoveOps {
  rmFile(file: string): void;
  isEmptyDir(dir: string): boolean;
  rmDir(dir: string): void;
}

const diskOps: RemoveOps = {
  rmFile: (file) => fs.rmSync(file, { force: true }),
  isEmptyDir: (dir) => fs.existsSync(dir) && fs.readdirSync(dir).length === 0,
  rmDir: (dir) => fs.rmdirSync(dir),
};

/**
 * Borra el index.html de cada copia, y su carpeta solo si se queda vacía: así nunca se lleva por
 * delante páginas reales que vivan dentro. Va de las rutas más profundas a las menos.
 */
export function removeFallbackCopies(root: string, urls: Iterable<string>, ops: RemoveOps): void {
  const depth = (url: string) => url.split('/').length;
  for (const url of [...urls].sort((a, b) => depth(b) - depth(a))) {
    const file = path.join(root, url, 'index.html');
    ops.rmFile(file);
    const dir = path.dirname(file);
    if (ops.isEmptyDir(dir)) ops.rmDir(dir);
  }
}

/** Filtro del sitemap: fuera las copias de respaldo (compara la ruta sin codificar) y las imágenes para redes. */
export function keepInSitemap(fallbacks: ReadonlySet<string>): (page: string) => boolean {
  return (page) => {
    const pathname = decodeURI(new URL(page).pathname);
    return !fallbacks.has(pathname) && !pathname.startsWith('/og/');
  };
}

export function dropFallbacks(urls: ReadonlySet<string>): AstroIntegration {
  return {
    name: 'drop-fallbacks',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        removeFallbackCopies(fileURLToPath(dir), urls, diskOps);
        logger.info(`${urls.size} copias de respaldo borradas`);
      },
    },
  };
}
