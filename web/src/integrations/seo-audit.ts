/**
 * SEO audit of the build: reads the generated HTML and fails the build if something SEO-related
 * broke (rules in src/lib/seo/audit.ts). It goes LAST in `integrations`: it needs the sitemap
 * already written.
 */
import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSite, type AuditPage } from '../lib/seo/audit';
import { closureBytes, scriptEntries } from '../lib/seo/js-budget';
import { parsePage } from '../lib/seo/page';

/** All the files of the build, as public paths: '/fase-0/que-es-dns/index.html'. */
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
        // Without `site` in astro.config.ts, the rules that compare absolute URLs give a clear
        // failure ("canonical=…, but it should be…") instead of breaking with "Invalid URL".
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
            `Heaviest JavaScript: ${Math.round(heaviest.jsBytes / 1024)} KB, on ${heaviest.url}`,
          );
        }
        if (issues.length > 0) {
          for (const issue of issues) logger.error(`${issue.url} [${issue.rule}] ${issue.message}`);
          throw new Error(
            `[seo-audit] ${issues.length} SEO problems: the build fails so they are not published.`,
          );
        }
        logger.info(`${pages.length} pages audited, no problems.`);
      },
    },
  };
}
