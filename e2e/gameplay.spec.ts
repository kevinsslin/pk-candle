import { test, expect } from '@playwright/test';

test('play a short session and submit leaderboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pkcandle-lang', 'en');
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await page.getByRole('button', { name: 'Enter Room' }).click();

  await page.getByRole('button', { name: 'Ready Up' }).click();
  await page.getByRole('button', { name: 'Start Countdown' }).click();

  await expect(page.getByText('Status: Live')).toBeVisible({ timeout: 15000 });

  const openLong = page.getByRole('button', { name: 'Open Long' });
  await expect(openLong).toBeEnabled();
  await openLong.click();

  const closePosition = page.getByRole('button', { name: 'Close Position' });
  await expect(closePosition).toBeEnabled();
  await closePosition.click();

  await expect(page.getByText('Recent Trades')).toBeVisible();
  await expect(page.getByText('Open')).toBeVisible();
  await expect(page.getByText('Close')).toBeVisible();

  await page.getByRole('button', { name: /Chat/ }).click();
  await page.getByPlaceholder('Type a message').fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('hello')).toBeVisible();
  await expect(page.locator('.danmaku-item')).toBeVisible({ timeout: 5000 });

  await expect(page.getByText('Game Over')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Claim Leaderboard' }).click();
  await expect(page.getByText('Leaderboard submitted.')).toBeVisible({ timeout: 5000 });
});
