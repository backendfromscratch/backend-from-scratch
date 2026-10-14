import { expect, test, type Page } from '@playwright/test';
import { strings as corsStrings } from '../src/playgrounds/cors-lab/strings';
import { strings as cryptoStrings } from '../src/playgrounds/crypto-keys/strings';
import { recorded } from '../src/playgrounds/dns-lookup/fixtures';
import { strings as dnsStrings } from '../src/playgrounds/dns-lookup/strings';
import { strings as tcpStrings } from '../src/playgrounds/tcp-handshake/strings';
import { strings as dockerStrings } from '../src/playgrounds/docker-layers/strings';
import { strings as sqlStrings } from '../src/playgrounds/sql-playground/strings';
import { expectAccessible, hydrate, open, settled, themes } from './axe';

// What the page scan does not see, because it only appears after something is done: the labs'
// states, a quiz answered, the menu on a phone, a glossary popover and the folded parts of the explorer.

/** The DNS lab answers with the responses recorded for its unit tests: no network, same result. */
async function recordedDns(page: Page): Promise<void> {
  await page.route(/^https:\/\/(cloudflare-dns\.com|dns\.google)\//, (route) => {
    const url = new URL(route.request().url());
    const key = `${url.searchParams.get('name')} ${url.searchParams.get('type')}`;
    if (!(key in recorded)) return route.abort();
    return route.fulfill({ contentType: 'application/dns-json', json: recorded[key] });
  });
}

for (const theme of themes) {
  test.describe(`${theme} theme`, () => {
    test('TCP lab: a lost segment in TCP, then UDP', async ({ page }) => {
      const t = tcpStrings.es;
      const lab = page.locator('.tcp-lab');
      const next = lab.getByRole('button', { name: t.next, exact: true });
      // Advances until the lab ends, losing the first segment that carries data.
      const playLosingOne = async () => {
        let lost = false;
        for (let i = 0; i < 80 && (await next.getAttribute('aria-disabled')) !== 'true'; i++) {
          const lose = lab.locator(`button[aria-label^="${t.lose}"][aria-label*="${t.quoteOpen}"]`);
          if (!lost && (await lose.count()) > 0) {
            await lose.first().click();
            lost = true;
          } else await next.click();
        }
        expect(lost).toBe(true);
      };

      await open(page, '/fase-0/tcp-vs-udp/', theme);
      await hydrate(page, '.tcp-lab');
      await playLosingOne();
      await expectAccessible(page, '.tcp-lab');

      await lab.locator('input[value="udp"]').check();
      await playLosingOne();
      await expectAccessible(page, '.tcp-lab');
    });

    test('DNS lab: the path step by step, the records and an error', async ({ page }) => {
      const t = dnsStrings.es;
      const lab = page.locator('.dns-lab');
      await recordedDns(page);
      await open(page, '/fase-0/que-es-dns/', theme);
      await hydrate(page, '.dns-lab');

      await lab.getByRole('button', { name: t.submit }).click();
      await expect(lab.locator('.dns-lab__status')).toContainText('Respuesta:');
      await lab.getByRole('button', { name: t.next }).click();
      await expectAccessible(page, '.dns-lab');
      await lab.getByRole('button', { name: t.showAll }).click();
      await expect(lab.locator('.dns-lab__records')).toBeVisible();
      await expectAccessible(page, '.dns-lab');

      await lab.locator('input[type="text"]').fill('192.168.1.1');
      await lab.getByRole('button', { name: t.submit }).click();
      await expect(lab.locator('.dns-lab__status')).toContainText(t.errors.ip.slice(0, 20));
      await expectAccessible(page, '.dns-lab');
    });

    test('CORS lab: a failure with its console message, then an approved preflight', async ({
      page,
    }) => {
      const t = corsStrings.es;
      const lab = page.locator('.cors-lab');
      await open(page, '/fase-2/que-es-cors/', theme);
      await hydrate(page, '.cors-lab');

      // The controls open, and the usual error to the end: the console shows Chrome's message.
      for (const summary of await lab.locator('summary').all()) await summary.click();
      await lab.getByRole('button', { name: t.all }).click();
      await expect(lab.locator('.cors-lab__console')).toContainText('TypeError: Failed to fetch');
      await expectAccessible(page, '.cors-lab');

      await lab.locator('.cors-lab__scenario select').selectOption('preflight-approved');
      await lab.getByRole('button', { name: t.next, exact: true }).click();
      await lab.getByRole('button', { name: t.all }).click();
      await expect(lab.locator('.cors-lab__answer--true')).toHaveCount(2);
      await expectAccessible(page, '.cors-lab');
    });

    test('SQL playground: a result table, an error and a psql command', async ({ page }) => {
      const t = sqlStrings.es;
      const lab = page.locator('.sql-lab').first();
      await open(page, '/fase-5/que-es-sql/', theme);
      // The lesson has two playgrounds: the first one is enough.
      await hydrate(page, '.sql-lab >> nth=0');

      // The first run downloads PostgreSQL (WebAssembly) and loads the shop: give it time.
      await lab.getByRole('button', { name: t.run, exact: true }).click();
      await expect(lab.locator('table')).toBeVisible({ timeout: 30_000 });
      await expectAccessible(page, '.sql-lab');

      const box = lab.locator('textarea');
      await box.fill('SELECT nombr FROM productos;');
      await lab.getByRole('button', { name: t.run, exact: true }).click();
      await expect(lab.locator('.sql-lab__error')).toContainText('does not exist');
      await expectAccessible(page, '.sql-lab');

      await box.fill('\\dt');
      await lab.getByRole('button', { name: t.run, exact: true }).click();
      await expect(lab.locator('.sql-lab__notice')).toContainText('es un comando de psql');
      await expectAccessible(page, '.sql-lab');
    });

    test('Docker layers lab: a build, a change in src/, the wrong order and multi-stage', async ({
      page,
    }) => {
      const t = dockerStrings.es;
      const lab = page.locator('.docker-lab');
      // The marks fade in: without motion, axe sees their final colours.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, '/fase-7/capas-docker/', theme);
      await hydrate(page, '.docker-lab');

      await lab.getByRole('button', { name: t.build, exact: true }).click();
      await expectAccessible(page, '.docker-lab');

      await lab.getByRole('button', { name: t.change.src }).click();
      await lab.getByRole('button', { name: t.rebuild, exact: true }).click();
      await expect(lab.locator('.docker-lab__layer--cached').first()).toBeVisible();
      await expectAccessible(page, '.docker-lab');

      await lab.locator('input[value="wrong"]').check();
      await lab.getByRole('button', { name: t.build, exact: true }).click();
      await expectAccessible(page, '.docker-lab');

      await lab.locator('input[value="on"]').check();
      await lab.getByRole('button', { name: t.build, exact: true }).click();
      await expectAccessible(page, '.docker-lab');
    });

    test('cryptography lab: encrypt, decrypt, the wrong key and a signature', async ({ page }) => {
      const t = cryptoStrings.es;
      const lab = page.locator('.crypto-lab');
      await open(page, '/fase-0/tls-y-https/', theme);
      await hydrate(page, '.crypto-lab');

      await lab.getByRole('button', { name: t.generate }).first().click();
      await expect(lab.getByRole('button', { name: t.encrypt })).toBeEnabled();
      await lab.getByRole('button', { name: t.encrypt }).click();
      await lab.getByRole('button', { name: t.decrypt, exact: true }).click();
      await expect(lab.getByText(t.decrypted, { exact: true })).toBeVisible();
      await expectAccessible(page, '.crypto-lab');

      await lab.getByRole('button', { name: t.wrongKey }).click();
      // Shown and announced (live region): two elements with the same text.
      await expect(lab.getByText(t.wrongKeyFailed).first()).toBeVisible();
      await expectAccessible(page, '.crypto-lab');

      await lab.getByRole('button', { name: t.generate }).last().click();
      await lab.getByRole('button', { name: t.sign }).click();
      await lab.getByRole('button', { name: t.verify }).click();
      // The decrypted message above also uses .crypto-lab__good: look for the verdict's text.
      await expect(lab.locator('.crypto-lab__good', { hasText: t.valid })).toBeVisible();
      await expectAccessible(page, '.crypto-lab');
    });

    test('the quiz: a right answer, a wrong one and the score', async ({ page }) => {
      await open(page, '/fase-0/que-es-el-backend/', theme);
      const questions = page.locator('.quiz__question');
      const answer = async (index: number, option: number) => {
        await questions.nth(index).locator('.quiz__choice').nth(option).click();
        await questions.nth(index).locator('.quiz__check').click();
      };
      // The first one wrong and the rest right: both marks and the sections to review show up.
      await answer(0, 0);
      for (const [index, option] of [
        [1, 2],
        [2, 0],
        [3, 2],
        [4, 1],
        [5, 0],
      ] as const) {
        await answer(index, option);
      }
      await expect(page.locator('.quiz__score')).toHaveText('Has acertado 5 de 6.');
      await expect(page.locator('.quiz__review-list a')).toHaveCount(1);
      await expectAccessible(page, '.quiz');
    });

    test('a glossary popover, open', async ({ page }) => {
      await open(page, '/fase-0/que-es-dns/', theme);
      const term = page.locator('.sl-markdown-content button[popovertarget]').first();
      await term.click();
      await expect(page.locator(':popover-open')).toBeVisible();
      await expectAccessible(page);
    });

    test('the explorer with every folder and the outline open', async ({ page }) => {
      await open(page, '/fase-1/comandos-basicos-terminal/', theme);
      await page.evaluate(() =>
        document.querySelectorAll('details').forEach((d) => (d.open = true)),
      );
      await expectAccessible(page);
    });

    test('the side panel hidden, and still hidden on the next page', async ({ page }) => {
      await open(page, '/fase-0/que-es-dns/', theme);
      const toggle = page.locator('.ide-explorer-toggle');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.sidebar-pane')).toBeHidden();
      await expectAccessible(page);
      await page.goto('/fase-0/tls-y-https/');
      await expect(page.locator('.sidebar-pane')).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('the menu open on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, '/fase-0/que-es-dns/', theme);
      await page.locator('.sl-menu-button button, button.sl-menu-button').first().click();
      await settled(page);
      await expectAccessible(page);
    });
  });
}
