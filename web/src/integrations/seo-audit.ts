/**
 * Auditoría SEO del build: lee el HTML generado y hace fallar el build si algo de SEO se ha roto
 * (reglas en src/lib/seo/audit.ts). Va la ÚLTIMA en `integrations`: necesita el sitemap ya escrito.
 */
import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSite, type AuditPage } from '../lib/seo/audit';
import { closureBytes, scriptEntries } from '../lib/seo/js-budget';
import { parsePage } from '../lib/seo/page';

/** Todos los ficheros del build, como rutas públicas: '/fase-0/que-es-dns/index.html'. */
function listFiles(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map(
      (entry) =>
        '/' +
        path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    );
}

export function seoAudit(): AstroIntegration {
  let site = 'http://localhost';
  return {
    name: 'seo-audit',
    hooks: {
      'astro:config:done': ({ config }) => {
        // Sin `site` (antes de la Tarea 2), las reglas que comparan URLs absolutas dan un fallo
        // claro («canonical=…, y debería ser…») en lugar de romper con «Invalid URL».
        site = config.site ?? 'http://localhost';
      },
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = listFiles(root);
        const read = (file: string) => {
          const full = path.join(root, file);
          return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined;
        };
        const pages: AuditPage[] = files
          .filter((file) => file.endsWith('/index.html') && !file.startsWith('/pagefind/'))
          .map((file) => {
            const html = read(file)!;
            return {
              url: file.slice(0, -'index.html'.length),
              facts: parsePage(html),
              jsBytes: closureBytes(scriptEntries(html), read),
            };
          });
        const sitemapXml = read('/sitemap-0.xml');
        const issues = auditSite({
          site,
          pages,
          files: new Set(files),
          robotsTxt: read('/robots.txt'),
          sitemap:
            sitemapXml === undefined
              ? undefined
              : [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc!),
        });

        const heaviest = pages.reduce<AuditPage | undefined>(
          (max, page) => (max === undefined || page.jsBytes > max.jsBytes ? page : max),
          undefined,
        );
        if (heaviest) {
          logger.info(
            `JavaScript más pesado: ${Math.round(heaviest.jsBytes / 1024)} KB, en ${heaviest.url}`,
          );
        }
        if (issues.length > 0) {
          for (const issue of issues) logger.error(`${issue.url} [${issue.rule}] ${issue.message}`);
          throw new Error(
            `[seo-audit] ${issues.length} problemas de SEO: el build falla para que no se publiquen.`,
          );
        }
        logger.info(`${pages.length} páginas auditadas, sin problemas.`);
      },
    },
  };
}
