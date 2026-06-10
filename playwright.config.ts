import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // inference-general only means something with the real model (the mock passes it trivially)
  testIgnore: ['**/integration.spec.ts', '**/inference.spec.ts', '**/inference-diag.spec.ts', '**/inference-general.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
    env: { USE_REAL_MODEL: 'false' }, // mock inference for fast UI/smoke tests
  },
});
