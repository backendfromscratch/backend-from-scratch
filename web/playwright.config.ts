import { defineConfig, devices } from '@playwright/test';

// Browser tests against the built site (`pnpm build` first): accessibility with axe-core on every
// page and on the labs' states, in dark and light. Named `*.e2e.ts` so Vitest does not pick them up.
const port = 4322;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  // On CI, every CPU of the runner (Playwright uses half by default): the tests only read pages.
  workers: process.env.CI ? '100%' : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    // --ignore-lock keeps the server in the foreground: when Astro detects an AI agent (Claude Code),
    // it starts `astro preview` in the background and the process Playwright watches ends at once.
    command: `pnpm exec astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    // Never another server that happens to be on the port (a dev server, an old build): the tests
    // are about the built site, so a busy port fails instead.
    reuseExistingServer: false,
  },
});
