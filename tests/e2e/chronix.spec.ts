import { expect, test } from '@playwright/test';

const email = process.env.CHRONIX_E2E_EMAIL ?? '';
const password = process.env.CHRONIX_E2E_PASSWORD ?? '';

test.describe('Chronix dashboard', () => {
  test.skip(!email || !password, 'Set CHRONIX_E2E_EMAIL and CHRONIX_E2E_PASSWORD for a real environment.');

  test('register/login, select a workspace, and inspect schedules', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/workspaces/);
    await page.getByRole('link', { name: /workspace/i }).first().click();
    await expect(page.getByRole('heading', { name: /schedules|jobs/i })).toBeVisible();
  });
});
