import { expect, test } from '@playwright/test';
import { open, themes } from './axe';
import { sceneLesson } from './scene';

// What each kind of page looks like: the home page, a lesson, the glossary and a page that doesn't
// exist, in dark and light, on a desktop and on a phone. Only what fits on the screen, not the whole
// page: enough to see the editor layout, the explorer, the header, the text and the code, and the
// screenshots stay small. The rules are in playwright.visual.config.ts.

const pages = [
  ['home', '/'],
  ['lesson', '/fase-2/metodos-http/'],
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

// A scene lesson with reduced motion: its first scene at its final frame, as a still diagram
// (docs/specs/2026-11-20-visual-lessons-design.md, §8). The caption is the scene's last one.
for (const theme of themes) {
  for (const [screen, size] of screens) {
    test(`scene lesson, ${theme}, ${screen}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, sceneLesson.es, theme);
      await page.locator('.scene-board.is-placed').waitFor();
      await expect(page.locator('.scene-caption')).not.toBeEmpty();
      await expect(page).toHaveScreenshot(`scenes-${theme}-${screen}.png`);
    });
  }
}
