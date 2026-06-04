import { test, expect } from '@playwright/test';

test('page makes no third-party requests on load', async ({ page }) => {
  const forbidden: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    // Allow same-origin (dev server)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
    // Allow HuggingFace — model is fetched once on first use, then cached
    if (url.hostname.endsWith('huggingface.co') || url.hostname.endsWith('.hf.co')) return;
    forbidden.push(request.url());
  });

  await page.goto('/');
  await page.locator('[data-testid="dropzone"]').waitFor({ state: 'visible' });

  // Short pause to let any deferred requests fire
  await page.waitForTimeout(1000);

  expect(
    forbidden,
    `Forbidden third-party requests: ${forbidden.join(', ')}`,
  ).toHaveLength(0);
});
