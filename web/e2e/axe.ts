import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const themes = ['dark', 'light'] as const;
export type Theme = (typeof themes)[number];

/** Opens the page with the theme already chosen, the way a returning reader sees it. */
export async function open(page: Page, path: string, theme: Theme): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
  await page.goto(path);
  await settled(page);
}

/**
 * Waits for the scripts that finish the page. Expressive Code makes code blocks that scroll
 * sideways focusable (tabindex="0") from JavaScript, a quarter of a second after loading;
 * before that, axe would report them as scroll regions the keyboard cannot reach.
 */
export async function settled(page: Page): Promise<void> {
  // `load` and not `networkidle`: the site has no requests after loading (the labs' islands are
  // waited for with `hydrate`), and networkidle adds half a second of silence to every test.
  // The fonts are part of `load`, so the code blocks already have their final width.
  await page.waitForLoadState('load');
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLElement>('.expressive-code pre')].every(
      (pre) => pre.scrollWidth <= pre.clientWidth || pre.hasAttribute('tabindex'),
    ),
  );
}

/** The WCAG 2.2 A and AA rules, the level the site promises. */
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * Known violations that are not ours to fix, each with its reason. Only that rule on that element
 * is ignored: anything else on the element still fails.
 */
const known = [
  {
    // Starlight's search button shows the shortcut (⌘K / Ctrl K) and its name does not include it.
    // Fixing it means replacing Starlight's whole search (docs/todo.md, "Starlight's search button").
    rule: 'label-content-name-mismatch',
    target: 'button[data-open-modal=""]',
  },
];

/** Fails with each violation and the elements it affects, readable in the CI log. */
export async function expectAccessible(page: Page, include?: string): Promise<void> {
  // A fade-in halfway through would be measured as low contrast: wait for the ones that end.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  let axe = new AxeBuilder({ page }).options({
    runOnly: { type: 'tag', values: tags },
    // Experimental in axe, so off by default: WCAG 2.5.3, the visible text is part of the accessible
    // name. It matters here because of the links that show a file name (style guide, "File names").
    rules: { 'label-content-name-mismatch': { enabled: true } },
  });
  if (include) axe = axe.include(include);
  const { violations: found } = await axe.analyze();
  const violations = found
    .map((v) => ({
      ...v,
      nodes: v.nodes.filter(
        (n) => !known.some((k) => k.rule === v.id && n.target.join(' ') === k.target),
      ),
    }))
    .filter((v) => v.nodes.length > 0);
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  - ${n.target.join(' ')}`).join('\n')}`,
  );
  expect(report, `${page.url()}\n${report.join('\n')}`).toEqual([]);
}

/**
 * Waits until a React island has hydrated: before that its buttons are there but do nothing.
 * The labs use `client:visible`, so it is scrolled into view first.
 */
export async function hydrate(page: Page, selector: string): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.locator(`astro-island:not([ssr]) ${selector}`).waitFor();
}
