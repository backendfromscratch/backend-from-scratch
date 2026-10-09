/**
 * Deletes from the build the fallback copies Starlight generates under /en/ for each Spanish page
 * whose path does not exist in English (see fallbackUrls). It goes BEFORE Starlight in
 * `integrations`: that way it deletes the files before Pagefind indexes the build.
 */
import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idFromContentPath } from '../lib/translations';

/** The ids of the entries in a content folder, as Astro generates them. */
export function listContentIds(docsDir: string): string[] {
  return fs
    .readdirSync(docsDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => idFromContentPath(file.split(path.sep).join('/')));
}

/** The file operations needed, so it can be tested without touching the disk. */
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
 * Deletes each copy's index.html, and its folder only if it ends up empty: that way it never takes
 * real pages living inside with it. It goes from the deepest paths to the shallowest.
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

/** Sitemap filter: drops the fallback copies (compares the decoded path) and the social images. */
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
        logger.info(`${urls.size} fallback copies deleted`);
      },
    },
  };
}
