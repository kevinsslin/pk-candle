import { test, expect } from '@playwright/test';

test('create room flow loads lobby', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pkcandle-lang', 'en');
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible();

  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('button', { name: 'Enter Room' })).toBeVisible();

  await page.getByRole('button', { name: 'Enter Room' }).click();
  await expect(page.getByText(/Room:/)).toBeVisible();
});
