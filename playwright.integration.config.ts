import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/integration.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 600_000, // Individual test timeout: 10 min (cold model download + inference)
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Disable WebGPU — headless Chrome exposes SwiftShader but ONNX JSEP ops
          // fail on it; FORCE_WASM env flag also skips the gpu probe at runtime.
          args: ['--disable-webgpu', '--disable-gpu'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    env: {
      USE_REAL_MODEL: 'true',
      FORCE_WASM: 'true',
    },
  },
});
