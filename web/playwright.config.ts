import { defineConfig, devices } from '@playwright/test';

// Browser tests against the built site (`pnpm build` first): accessibility with axe-core on every
// page and on the labs' states, in dark and light. Named `*.e2e.ts` so Vitest does not pick them up.
const port = 4322;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `pnpm exec astro preview --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
