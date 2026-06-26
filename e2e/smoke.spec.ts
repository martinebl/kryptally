import { test, expect } from '@playwright/test';

test('app loads and renders landing page', async ({ page }) => {
  await page.goto('/');

  // Brand name is visible
  await expect(page.locator('text=Kryptax').first()).toBeVisible();

  // Hero heading renders
  await expect(page.locator('h1')).toBeVisible();

  // Country select is present
  await expect(page.locator('select')).toBeVisible();

  // Footer version is present
  await expect(page.locator('text=v0')).toBeVisible();
});

test('nav tabs render', async ({ page }) => {
  await page.goto('/');

  // Nav tabs are visible (target header nav buttons specifically)
  const nav = page.locator('header nav');
  await expect(nav.getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Import' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Results' })).toBeVisible();

  // Import/Results tabs are disabled without country selected
  await expect(nav.getByRole('button', { name: 'Import' })).toBeDisabled();
  await expect(nav.getByRole('button', { name: 'Results' })).toBeDisabled();
});

test('badge component renders correctly', async ({ page }) => {
  await page.goto('/');

  // Landing page residency tags exist (uses inline <span> badges — landing page specific)
  const localTag = page.locator('text=On your device');
  await expect(localTag.first()).toBeVisible();

  const netTag = page.locator('text=Looked up');
  await expect(netTag.first()).toBeVisible();
});
