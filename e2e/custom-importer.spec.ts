import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for user-defined CSV importers: build one in the
 * Importers editor from a sample file, then use it on the Import page.
 *
 * Every row carries a value in the tax currency (DKK for Denmark), so the
 * import needs no market prices. Price APIs are aborted so the test fails
 * rather than silently going to the network if that ever changes.
 */

const IMPORTER_NAME = 'Fjord Exchange';

// Semicolon-delimited, to exercise delimiter sniffing.
const CSV = [
  'Executed At;Side;Coin;Qty;Total',
  '2021-03-09T08:41:17Z;BUY;BTC;0.0412;7315.80',
  '2022-11-23T19:05:42Z;BUY;ETH;1.37;12907.55',
  '2023-06-14T12:30:03Z;SELL;BTC;0.0150;3998.10',
].join('\n');

const csvFile = (name: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(CSV) });

const nav = (page: Page) => page.locator('header nav');

test('creates a custom importer and imports a file with it', async ({ page }) => {
  await page.route(/api\.coingecko\.com|api\.frankfurter\.(app|dev)/, (route) => route.abort());

  // ── 1. Pick a country (enables Import) ────────────────────────────────
  await page.goto('/');
  await page.locator('select').first().selectOption('DK');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Import transactions' })).toBeVisible();

  // ── 2. Build the importer from a sample file ──────────────────────────
  await nav(page).getByRole('button', { name: 'Importers' }).click();
  await page.getByRole('button', { name: 'New importer' }).click();
  await expect(page.getByRole('heading', { name: 'New importer' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(csvFile('sample.csv'));
  await expect(page.locator('#delimiter')).toHaveValue(';');

  await page.locator('#importer-name').fill(IMPORTER_NAME);
  await page.locator('#col-date').fill('Executed At');
  await page.locator('#col-asset').fill('Coin');
  await page.locator('#col-amount').fill('Qty');
  await page.locator('#col-total').fill('Total');
  await page.locator('#col-type').fill('Side');
  await page.getByRole('button', { name: /Add rules for values in the sample/ }).click();
  await expect(page.getByRole('textbox', { name: 'Value' })).toHaveCount(2);

  await page.locator('#quote-mode').selectOption('fixed');
  await page.locator('#quote-value').fill('DKK');

  await expect(page.getByText('3 transactions parsed')).toBeVisible();
  // Date | Type | Sent | Received | Fee | Value
  await expect(page.getByRole('row').nth(1).getByRole('cell')).toHaveText([
    '2021-03-09 08:41:17', 'buy', '7315.8 DKK', '0.0412 BTC', '—', '7315.8 DKK',
  ]);

  await page.getByRole('button', { name: 'Save importer' }).click();
  await expect(page.getByRole('heading', { name: 'CSV importers' })).toBeVisible();
  await expect(page.getByText(IMPORTER_NAME)).toBeVisible();

  // ── 3. Use it: auto-detected on the Import page, then imported ────────
  await nav(page).getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('#csv-input').setInputFiles(csvFile('fjord-export.csv'));
  await expect(page.locator('#importer-select')).toHaveValue(IMPORTER_NAME);

  await page.getByRole('main').getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(`Parsed 3 transactions from ${IMPORTER_NAME}`)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('3 new · 0 duplicates skipped')).toBeVisible();

  // ── 4. The importer survives a reload (stored in IndexedDB) ───────────
  await page.reload();
  await nav(page).getByRole('button', { name: 'Importers' }).click();
  await expect(page.getByText(IMPORTER_NAME)).toBeVisible();
});

test('an unchecked required column stays available to re-check without a sample', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Importers' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Ledger' }).getByRole('button', { name: 'Duplicate to edit' }).click();
  await expect(page.getByRole('heading', { name: 'New importer' })).toBeVisible();

  const column = page.getByRole('checkbox', { name: 'Operation Hash' });
  await expect(column).toBeChecked();

  await column.uncheck();
  await expect(column).toBeVisible();
  await expect(column).not.toBeChecked();

  await column.check();
  await expect(column).toBeChecked();
});
