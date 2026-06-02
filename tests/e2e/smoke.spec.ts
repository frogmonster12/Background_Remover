import { expect, test } from '@playwright/test';

test('dev server loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();

  expect(errors).toHaveLength(0);
});
