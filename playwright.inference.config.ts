import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the real-model inference spike.
 * Starts a separate dev server on port 5174 with USE_REAL_MODEL=true
 * so the worker is compiled with __USE_REAL_MODEL__ = true by Vite.
 *
 * Run: npm run test:e2e:inference
 * First run downloads ~115 MB (BiRefNet_lite fp16). Subsequent runs use the browser Cache API.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /inference.*\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
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
          // Disable WebGPU in headless mode — no discrete GPU in CI/test environments.
          // The inference spike verifies the WASM fallback path (fp32, ~224 MB).
          args: ['--disable-webgpu', '--disable-gpu'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 30_000,
    // FORCE_WASM bypasses navigator.gpu probe — headless Chrome exposes SwiftShader
    // as a WebGPU adapter but ONNX JSEP ops fail on it.
    env: { USE_REAL_MODEL: 'true', FORCE_WASM: 'true' },
  },
});
