import { expect, test } from '@playwright/test';
import { settled } from './axe';

// What a reader does with the site itself, not inside a lab: search, switch language and theme,
// report a problem with a lesson and land on a page that doesn't exist. Each one checks that the
// thing works; its accessibility is checked in pages.e2e.ts and states.e2e.ts.

test('the search finds a lesson in the language of the page', async ({ page }) => {
  for (const [home, lesson] of [
    ['/', '/fase-0/que-es-dns/'],
    ['/en/', '/en/phase-0/what-is-dns/'],
  ] as const) {
    await page.goto(home);
    await settled(page);
    // Starlight's search: a button that opens a dialog with Pagefind's box. The index is per
    // language, so the same word finds the lesson of that language.
    await page.locator('button[data-open-modal]:visible').click();
    await page.locator('dialog[open] input').fill('DNS');
    const result = page.locator(`dialog[open] a[href^="${lesson}"]`).first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();
    await expect(page).toHaveURL(new RegExp(`${lesson}(#.*)?$`));
  }
});

test('«ES · EN» goes to the translation of the same lesson, and back', async ({ page }) => {
  // The routes are translated: the English lesson is not the Spanish route with /en/ in front.
  const links = page.locator('[data-language-links]:visible');
  await page.goto('/fase-0/que-es-dns/');
  await expect(links.locator('a[hreflang="es"]')).toHaveAttribute('aria-current', 'page');
  await links.locator('a[hreflang="en"]').click();
  await expect(page).toHaveURL('/en/phase-0/what-is-dns/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await links.locator('a[hreflang="es"]').click();
  await expect(page).toHaveURL('/fase-0/que-es-dns/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('the theme button switches the theme, and the choice stays on the next pages', async ({
  page,
}) => {
  // Until the first click, the page follows the system.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/fase-0/que-es-dns/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('.ide-theme-toggle:visible').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.goto('/en/phase-0/what-is-dns/');
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('the link after a lesson opens an issue with the lesson filled in', async ({ page }) => {
  for (const [path, template] of [
    ['/fase-0/que-es-dns/', 'leccion.yml'],
    ['/en/phase-0/what-is-dns/', 'lesson.yml'],
  ] as const) {
    await page.goto(path);
    const href = await page.locator('.ide-feedback a').getAttribute('href');
    const url = new URL(href!);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://github.com/backendfromscratch/backend-from-scratch/issues/new',
    );
    expect(url.searchParams.get('template')).toBe(template);
    expect(url.searchParams.get('lesson')).toBe(`https://backenddesdecero.com${path}`);
    // The title of this lesson, the one on its page, in brackets: the reader writes after it.
    const title = (await page.locator('h1#_top').textContent())?.trim();
    expect(url.searchParams.get('title')).toBe(`[${title}] `);
  }
  // Only after a lesson: not on the home page.
  await page.goto('/');
  await expect(page.locator('.ide-feedback')).toHaveCount(0);
});

test("a page that doesn't exist answers 404, with the site around it", async ({ page }) => {
  const response = await page.goto('/fase-0/no-existe/');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/^404 \| /);
  // The header is still there: the way back home.
  await expect(page.locator('header a[href="/"]').first()).toBeVisible();
});
