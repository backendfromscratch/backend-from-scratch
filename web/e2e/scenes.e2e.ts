import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { cueIds, readPart, sceneLesson, scenesReady, shifts, watchShifts } from './scene';

// What a reader does with a scene lesson (docs/specs/2026-11-20-visual-lessons-design.md, §2 and
// §8): scroll the text, use the scene's controls, move the line between scene and text, fold the
// scene on a phone. And that none of it moves the page (CLS). Its accessibility is in states.e2e.ts.

const ui = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/content/i18n/es.json', import.meta.url)), 'utf8'),
) as Record<string, string>;
const speedName = (speed: string) => ui['scenes.speed']!.replace('{speed}', speed);

const count = (page: Page) => page.locator('#scene-count');
const play = (page: Page) => page.locator('#scene-play');
const textWidth = (page: Page) =>
  page.locator('main').evaluate((main) => main.getBoundingClientRect().width);
const paneWidth = (page: Page) => page.locator('.main-pane').evaluate((pane) => pane.clientWidth);

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('scrolling the text plays the scene of the part being read, and highlights the part', async ({
    page,
  }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await expect(count(page)).toHaveText('1/12');
    await readPart(page, 'dns');
    await expect(count(page)).toHaveText('4/12');
    await expect(page.locator('.scene-stage')).toHaveAttribute('data-view', 'dns');
    await expect(play(page)).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.scene-part-bar')).toBeVisible();
    await expect(page.locator('.scene-cue[data-scene="dns"] + *')).toHaveClass(/is-reading/);
    // Jumping past <Scene end />: the last scene, at its final frame, and no part highlighted.
    await readPart(page, 'end');
    await expect(count(page)).toHaveText('12/12');
    await expect(play(page)).toHaveAttribute('data-state', 'ended');
    await expect(page.locator('.scene-part-bar')).toBeHidden();
    await expect(page.locator('.is-reading')).toHaveCount(0);
  });

  test('previous and next take the text to the part and play its scene; so do the arrow keys', async ({
    page,
  }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await readPart(page, 'dns');
    await expect(count(page)).toHaveText('4/12');
    await page.getByRole('button', { name: ui['scenes.next'], exact: true }).click();
    await expect(count(page)).toHaveText('5/12');
    // The TCP part's heading is at the reading line (42% of the window), give or take.
    await expect
      .poll(() =>
        page
          .locator('.scene-cue[data-scene="tcp"] + *')
          .evaluate((h) => h.getBoundingClientRect().top / innerHeight),
      )
      .toBeLessThan(0.45);
    await page.getByRole('button', { name: ui['scenes.prev'], exact: true }).click();
    await expect(count(page)).toHaveText('4/12');
    await expect(play(page)).toHaveAttribute('data-state', 'playing');
    // With the focus on the page, not in a control, → goes to the next scene.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ArrowRight');
    await expect(count(page)).toHaveText('5/12');
    await page.keyboard.press('ArrowLeft');
    await expect(count(page)).toHaveText('4/12');
  });

  test('pause freezes the scene, its animations and the clock; the same button resumes it', async ({
    page,
  }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await readPart(page, 'tcp');
    await expect(play(page)).toHaveAttribute('data-state', 'playing');
    await page.waitForTimeout(1200);
    await play(page).click();
    await expect(play(page)).toHaveAttribute('data-state', 'paused');
    await expect(play(page)).toHaveAccessibleName(ui['scenes.resume']!);
    const caption = await page.locator('.scene-caption').textContent();
    const clock = await page.locator('#sc-clock').textContent();
    const running = () =>
      page.evaluate(
        () =>
          document
            .querySelector('.scene-stage')!
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === 'running').length,
      );
    expect(await running()).toBe(0);
    await page.waitForTimeout(2500);
    await expect(page.locator('.scene-caption')).toHaveText(caption ?? '');
    await expect(page.locator('#sc-clock')).toHaveText(clock ?? '');
    expect(await running()).toBe(0);
    await play(page).click();
    await expect(play(page)).toHaveAttribute('data-state', 'playing');
    await expect(play(page)).toHaveAccessibleName(ui['scenes.pause']!);
  });

  test('the speed button goes slow, fast and normal, and the choice is remembered', async ({
    page,
  }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    const speed = page.locator('#scene-speed');
    await expect(speed).toHaveAccessibleName(speedName(ui['scenes.speedNormal']!));
    await speed.click();
    await expect(speed).toHaveAccessibleName(speedName(ui['scenes.speedSlow']!));
    await page.reload();
    await scenesReady(page);
    await expect(speed).toHaveAccessibleName(speedName(ui['scenes.speedSlow']!));
    await speed.click();
    await expect(speed).toHaveAccessibleName(speedName(ui['scenes.speedFast']!));
  });

  test('the line between scene and text moves with the keyboard and the pointer, and is remembered', async ({
    page,
  }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await readPart(page, 'dns');
    await expect(count(page)).toHaveText('4/12');
    const sash = page.getByRole('separator', { name: ui['scenes.split'] });
    const start = await textWidth(page);
    const pane = await paneWidth(page);

    // A click without dragging (WCAG 2.5.7) goes through the widest text, the narrowest and back.
    await sash.click();
    await expect.poll(() => textWidth(page)).toBeCloseTo(pane - 22 * 16, 0);
    await sash.click();
    await expect.poll(() => textWidth(page)).toBeCloseTo(21 * 16, 0);
    await sash.click();
    await expect.poll(() => textWidth(page)).toBeCloseTo(start, 0);

    // The arrows move the line, not the scene, while the line has the focus.
    await sash.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => textWidth(page)).toBeCloseTo(start + 24, 0);
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => textWidth(page)).toBeCloseTo(start + 24 - 96, 0);
    await expect(sash).toHaveAttribute('aria-valuetext', /^texto \d+ %, escena \d+ %$/);
    await expect(count(page)).toHaveText('4/12');

    // Dragged 100px to the left, the text is 100px wider.
    const before = await textWidth(page);
    const box = (await sash.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 50, y, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 - 100, y, { steps: 4 });
    await page.mouse.up();
    const dragged = await textWidth(page);
    expect(Math.abs(dragged - before - 100)).toBeLessThan(8);

    await page.reload();
    await scenesReady(page);
    expect(Math.abs((await textWidth(page)) - dragged)).toBeLessThan(1);

    // Home and End: the text never under 21rem, the scene never under 22rem.
    await sash.focus();
    await page.keyboard.press('Home');
    await expect.poll(() => textWidth(page)).toBeCloseTo(21 * 16, 0);
    await page.keyboard.press('End');
    await expect.poll(() => textWidth(page)).toBeCloseTo(pane - 22 * 16, 0);
  });

  test('the arrow keys leave alone the line, the controls and the ends', async ({ page }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await readPart(page, 'rtt');
    await expect(count(page)).toHaveText('11/12');
    // The round trips' near/far switch is a control of its own.
    await page.locator('.sc-time__options button[data-value="far"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await expect(count(page)).toHaveText('11/12');
    // At the last scene, → goes nowhere: the text stays where it is.
    await readPart(page, 'try');
    await expect(count(page)).toHaveText('12/12');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const y = await page.evaluate(() => scrollY);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBe(y);
    // Past <Scene end /> (the quiz), the arrows are the page's again.
    await readPart(page, 'end');
    await expect(page.locator('.scene-part-bar')).toBeHidden();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);
    await expect(count(page)).toHaveText('12/12');
  });

  test('a fast scroll through the parts leaves only the scene where the reader stops', async ({
    page,
  }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    // Less than the 160ms of quiet a scene waits for: none of these starts but the last.
    for (const id of ['url', 'dns', 'tcp', 'tls', 'http']) {
      await readPart(page, id);
      await page.waitForTimeout(50);
    }
    await expect(count(page)).toHaveText('7/12');
    await expect(page.locator('.scene-stage')).toHaveAttribute('data-view', 'net');
    await page.waitForTimeout(1500);
    // Nothing from the scenes it went through: the DNS question, the certificate, the URL's map.
    await expect(page.locator('.scene-fx')).not.toContainText('example.com?');
    await expect(page.locator('.scene-fx')).not.toContainText('certificado');
    await expect(page.locator('#sc-um-scheme')).not.toHaveClass(/is-on/);
  });

  test('a small change of the window does not cut the scene short', async ({ page }) => {
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await readPart(page, 'dns');
    await expect(play(page)).toHaveAttribute('data-state', 'playing');
    // A few pixels taller (a bar of the browser, a late font): the scene goes on.
    await page.setViewportSize({ width: 1440, height: 908 });
    await page.waitForTimeout(500);
    await expect(play(page)).toHaveAttribute('data-state', 'playing');
  });

  test('with reduced motion, every scene shows its final frame at once, with no errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    const ids = await cueIds(page);
    for (const [i, id] of ids.entries()) {
      await readPart(page, id);
      await expect(count(page)).toHaveText(`${i + 1}/${ids.length}`);
      await expect(page.locator('.scene-caption')).not.toBeEmpty();
      if (id === 'tls') await expect(page.locator('#sc-lock')).toHaveClass(/is-on/);
    }
    await expect(play(page)).toBeDisabled();
    await expect(page.locator('#scene-speed')).toBeDisabled();
    await page.getByRole('button', { name: ui['scenes.prev'], exact: true }).click();
    await expect(count(page)).toHaveText(`${ids.length - 1}/${ids.length}`);
    expect(errors).toEqual([]);
  });

  test('the English lesson has the same scenes, in English', async ({ page }) => {
    await page.goto(sceneLesson.en);
    await scenesReady(page);
    await readPart(page, 'dns');
    await expect(count(page)).toHaveText('4/12');
    await expect(page.locator('#scene-title')).toHaveText(
      '2 · It looks up the server’s IP address',
    );
  });
});

test('under 75rem, a scene lesson starts with the explorer folded, unless the reader chose', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(sceneLesson.es);
  await expect(page.locator('html')).toHaveAttribute('data-ide-explorer', 'collapsed');
  // A lesson without scenes keeps it open.
  await page.goto('/fase-1/comandos-basicos-terminal/');
  await expect(page.locator('html')).not.toHaveAttribute('data-ide-explorer', 'collapsed');
  // The reader opened it: it stays open on a scene lesson too.
  await page.evaluate(() => localStorage.setItem('ide-explorer', 'shown'));
  await page.goto(sceneLesson.es);
  await expect(page.locator('html')).not.toHaveAttribute('data-ide-explorer', 'collapsed');
});

test('a stored text width that no longer fits is clamped to the window', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ide-scene-split', '5000'));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(sceneLesson.es);
  await scenesReady(page);
  expect(Math.abs((await textWidth(page)) - ((await paneWidth(page)) - 22 * 16))).toBeLessThan(1);
});

test('on a phone, the scene folds into its bar and stays folded; scrolling still changes the scene', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sceneLesson.es);
  await scenesReady(page);
  await expect(page.getByRole('separator')).toBeHidden();
  await page.getByRole('button', { name: ui['scenes.fold'], exact: true }).click();
  const unfold = page.getByRole('button', { name: ui['scenes.unfold'], exact: true });
  await expect(unfold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.scene-stage')).toBeHidden();
  await page.reload();
  await scenesReady(page);
  await expect(page.locator('.scene-stage')).toBeHidden();
  await readPart(page, 'dns');
  await expect(count(page)).toHaveText('4/12');
  await unfold.click();
  await expect(page.locator('.scene-stage')).toBeVisible();
  await expect(play(page)).toHaveAttribute('data-state', 'playing');
});

test('on a phone, a jump to a heading lands under the scene, not behind it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${sceneLesson.es}#4-tls-cifra-la-conexión`);
  await scenesReady(page);
  const below = await page.evaluate(() => {
    const heading = document.getElementById('4-tls-cifra-la-conexión')!;
    return (
      heading.getBoundingClientRect().top -
      document.querySelector('.scene-panel')!.getBoundingClientRect().bottom
    );
  });
  expect(below).toBeGreaterThanOrEqual(0);
});

for (const [screen, size, stored] of [
  ['a computer', { width: 1440, height: 900 }, { 'ide-scene-split': '600' }],
  ['a phone', { width: 390, height: 844 }, { 'ide-scene-folded': 'folded' }],
] as const) {
  test(`on ${screen}, the reader's stored choices are in place from the first paint (no shift)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.addInitScript((values) => {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    }, stored);
    await watchShifts(page);
    await page.goto(sceneLesson.es);
    await scenesReady(page);
    await page.waitForTimeout(800);
    expect(await shifts(page)).toBeLessThan(0.01);
    if ('ide-scene-split' in stored) expect(await textWidth(page)).toBeCloseTo(600, 0);
    else await expect(page.locator('.scene-stage')).toBeHidden();
  });
}

// Every scene lesson of the built site, not only the pilot: a new one is checked without touching this file.
const sitemap = readFileSync(
  fileURLToPath(new URL('../dist/sitemap-0.xml', import.meta.url)),
  'utf8',
);
const withScenes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]!).pathname)
  .filter((path) =>
    readFileSync(
      fileURLToPath(new URL(`../dist${path}index.html`, import.meta.url)),
      'utf8',
    ).includes('class="scene-panel'),
  );

test('the site has scene lessons to check', () => {
  expect(withScenes).toEqual(expect.arrayContaining([sceneLesson.es, sceneLesson.en]));
});

for (const path of withScenes) {
  for (const [screen, size] of [
    ['a computer', { width: 1440, height: 900 }],
    ['a phone', { width: 390, height: 844 }],
  ] as const) {
    test(`${path}: reading the whole lesson on ${screen}, every scene to its end, moves nothing (CLS under 0.01)`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize(size);
      await watchShifts(page);
      // Eight times faster (boot.ts, testRate): every scene plays to its end in a few seconds.
      await page.goto(`${path}?scene-rate=8`);
      await scenesReady(page);
      const ids = await cueIds(page);
      for (const [i, id] of ids.entries()) {
        await readPart(page, id);
        await expect(count(page)).toHaveText(`${i + 1}/${ids.length}`);
        await expect(play(page)).toHaveAttribute('data-state', 'playing');
        await expect(play(page)).toHaveAttribute('data-state', 'ended', { timeout: 20_000 });
      }
      if ((await page.locator('.scene-cue[data-scene-end]').count()) > 0) {
        await readPart(page, 'end');
        await page.waitForTimeout(500);
      }
      expect(await shifts(page)).toBeLessThan(0.01);
    });
  }
}
