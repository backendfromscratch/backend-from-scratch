import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import { expectAccessible, open, themes } from './axe';

// Every page in the sitemap, plus the 404: every rule in the dark theme (the default) and, in the
// light one, only contrast, the only thing the theme changes. Halves the time on CI, where axe is the
// slow part. The labs' states (states.e2e.ts) run every rule in both themes.
const sitemap = readFileSync(
  fileURLToPath(new URL('../dist/sitemap-0.xml', import.meta.url)),
  'utf8',
);
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);

for (const theme of themes) {
  test.describe(`${theme} theme`, () => {
    for (const path of [...paths, '/404/']) {
      test(path, async ({ page }) => {
        await open(page, path, theme);
        await expectAccessible(page, undefined, { contrastOnly: theme === 'light' });
      });
    }
  });
}
