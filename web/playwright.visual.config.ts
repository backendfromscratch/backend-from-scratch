import { defineConfig, devices } from '@playwright/test';

// The design, compared with screenshots (e2e/screenshots/) of a few pages, dark and light, on a
// desktop and on a phone. Fonts and rendering change from one system to another, so they are taken
// and compared only inside Playwright's Docker image (e2e/playwright-image.txt), the same one on your
// computer and in CI: `pnpm test:visual` after `pnpm build`, and `pnpm test:visual
// --update-snapshots` to take them again after a change in the design you meant to make.
const port = 4323;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.visual.ts',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  expect: {
    // The same image draws the same pixels; a few may change with antialiasing.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `node e2e/serve-dist.mjs ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  },
});
