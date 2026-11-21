import type { Page } from '@playwright/test';
import { settled } from './axe';

// Helpers for the tests of scene lessons (docs/specs/2026-11-20-visual-lessons-design.md, §8).

/** The pilot: «De la URL a la página». */
export const sceneLesson = {
  es: '/fase-0/que-pasa-cuando-escribes-una-url/',
  en: '/en/phase-0/what-happens-when-you-type-a-url/',
};

/** Waits until the engine has placed the first scene's actors (also when the scene is folded). */
export async function scenesReady(page: Page): Promise<void> {
  await settled(page);
  await page.locator('.scene-board.is-placed').waitFor({ state: 'attached' });
}

/**
 * Scrolls the text as a reader does until a part's heading has just passed the reading line: 42%
 * of the window on a computer, 30% of the space under the scene when it is on top (a phone).
 * `end` scrolls to the text after <Scene end />.
 */
export async function readPart(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const cue = document.querySelector(
      id === 'end' ? '.scene-cue[data-scene-end]' : `.scene-cue[data-scene="${id}"]`,
    );
    const heading = cue?.nextElementSibling;
    if (!heading) throw new Error(`No cue «${id}» followed by a heading`);
    const panel = document.querySelector('.scene-panel')!.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    const stacked = panel.right > main.left + 1;
    const line = stacked ? panel.bottom + 0.3 * (innerHeight - panel.bottom) : 0.42 * innerHeight;
    window.scrollTo(0, scrollY + heading.getBoundingClientRect().top - line + 20);
  }, id);
}

/** The ids of a scene lesson's cues, in order, read from the page. */
export async function cueIds(page: Page): Promise<string[]> {
  return page.$$eval('.scene-cue[data-scene]', (cues) =>
    cues.map((cue) => cue.getAttribute('data-scene')!),
  );
}

/**
 * Adds up the page's layout shifts from its first paint, as Google's CLS does: every shift without
 * recent input (scrolling is not input). Call it before `page.goto`; read the total with `shifts`.
 */
export async function watchShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as unknown as { cls: number };
    win.cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) win.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

export async function shifts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { cls: number }).cls);
}
