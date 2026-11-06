import { expect, test } from '@playwright/test';
import { open, themes } from './axe';

// What each kind of page looks like: the home page, a lesson, the glossary and a page that doesn't
// exist, in dark and light, on a desktop and on a phone. Only what fits on the screen, not the whole
// page: enough to see the editor layout, the explorer, the header, the text and the code, and the
// screenshots stay small. The rules are in playwright.visual.config.ts.

const pages = [
  ['home', '/'],
  ['lesson', '/fase-0/que-es-dns/'],
  ['glossary', '/glossary/'],
  ['not-found', '/fase-0/no-existe/'],
] as const;

const screens = [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
] as const;

for (const [name, path] of pages) {
  for (const theme of themes) {
    for (const [screen, size] of screens) {
      test(`${name}, ${theme}, ${screen}`, async ({ page }) => {
        await page.setViewportSize(size);
        await open(page, path, theme);
        await expect(page).toHaveScreenshot(`${name}-${theme}-${screen}.png`);
      });
    }
  }
}
