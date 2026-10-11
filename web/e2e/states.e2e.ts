import { expect, test, type Page } from '@playwright/test';
import { strings as cryptoStrings } from '../src/playgrounds/crypto-keys/strings';
import { recorded } from '../src/playgrounds/dns-lookup/fixtures';
import { strings as dnsStrings } from '../src/playgrounds/dns-lookup/strings';
import { strings as tcpStrings } from '../src/playgrounds/tcp-handshake/strings';
import { expectAccessible, hydrate, open, settled, themes } from './axe';

// What the page scan does not see, because it only appears after something is done: the labs'
// states, the menu on a phone, a glossary popover and the folded parts of the explorer.

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

    test('the menu open on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, '/fase-0/que-es-dns/', theme);
      await page.locator('.sl-menu-button button, button.sl-menu-button').first().click();
      await settled(page);
      await expectAccessible(page);
    });
  });
}
