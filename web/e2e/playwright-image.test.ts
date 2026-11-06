import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

// The screenshots are taken in Playwright's Docker image (playwright-image.txt), and its browsers
// only work with the same version of @playwright/test. Dependabot updates the package, not that
// file: this test fails on its pull request until the image is updated too.
test("the screenshots' image is the installed Playwright's version, pinned by digest", () => {
  const image = readFileSync(new URL('playwright-image.txt', import.meta.url), 'utf8').trim();
  const { version } = createRequire(import.meta.url)('@playwright/test/package.json') as {
    version: string;
  };
  const [name, digest] = image.split('@');
  expect(name).toBe(`mcr.microsoft.com/playwright:v${version}-noble`);
  expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
});
