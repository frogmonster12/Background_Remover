import { defineConfig, devices } from '@playwright/test';

/**
 * Production-build E2E: runs the integration spec against `vite preview`
 * (the built dist/, real model, real service worker) instead of the dev
 * server. Run `npm run build` first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/integration.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 600_000, // cold model load + real inference
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 5175',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
