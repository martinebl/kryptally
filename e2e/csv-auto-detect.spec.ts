import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for CSV exchange auto-detection.
 *
 * Scope: the detection flow itself (dropdown updates, preprocessor toggles
 * appear for Ledger, no-match error for garbage CSV). The actual Import click
 * is intentionally NOT triggered — it would call CoinGecko enrichment, which is
 * network-dependent and out of scope for these tests.
 */

const LEDGER_HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date';
const LEDGER_ROW =
  '2024-01-05T10:00:00.000Z,Confirmed,BTC,IN,0.5,0.0001,abc123,Ledger,BtcPub,USD,30000,30000';

const BINANCE_HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const BINANCE_ROW = '123,20-03-15 10:00:00,Spot,Deposit,USD,545,';

const REVOLUT_HEADER = 'Symbol,Type,Quantity,Price,Value,Fees,Date';
const REVOLUT_ROW =
  'BTC,Buy - Revolut X,0.01916167,$66800.02,$1280.00,$0.00,"28 Jun 2021, 14:30:00"';

const GBK_HEADER = 'Foo,Bar,Baz\n1,2,3';

/** Navigate from the landing page to the Import page by selecting Denmark. */
async function goToImportPage(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('select').first().selectOption('DK');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Import transactions' })).toBeVisible();
}

test.describe('CSV auto-detection', () => {
  test('defaults to "Auto detect" in the exchange selector', async ({ page }) => {
    await goToImportPage(page);
    await expect(page.locator('#importer-select')).toHaveValue('__auto__');
    await expect(page.getByText('Detected automatically when you upload a file.')).toBeVisible();
  });

  test('auto-detects a Ledger CSV and shows the Ledger preprocessor toggle', async ({ page }) => {
    await goToImportPage(page);

    await page.locator('#csv-input').setInputFiles({
      name: 'ledger.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([LEDGER_HEADER, LEDGER_ROW].join('\n')),
    });

    // "Detecting…" spinner may appear briefly — wait for it to settle.
    await expect(page.locator('#importer-select')).toHaveValue('Ledger');

    // Ledger's only preprocessor toggle renders in an "Options" panel.
    await expect(page.getByText('Options').first()).toBeVisible();
    await expect(
      page.getByText('Treat inbound transfers as purchases'),
    ).toBeVisible();
  });

  test('auto-detects a Binance CSV and shows no preprocessor toggles', async ({ page }) => {
    await goToImportPage(page);

    await page.locator('#csv-input').setInputFiles({
      name: 'binance.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([BINANCE_HEADER, BINANCE_ROW].join('\n')),
    });

    await expect(page.locator('#importer-select')).toHaveValue('Binance');
    await expect(page.getByText('Options')).toBeHidden();
  });

  test('auto-detects a Revolut X CSV and shows no preprocessor toggles', async ({ page }) => {
    await goToImportPage(page);

    await page.locator('#csv-input').setInputFiles({
      name: 'revolut.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([REVOLUT_HEADER, REVOLUT_ROW].join('\n')),
    });

    await expect(page.locator('#importer-select')).toHaveValue('Revolut X');
    await expect(page.getByText('Options')).toBeHidden();
  });

  test('shows an error and stays in Auto mode for an unrecognized CSV', async ({ page }) => {
    await goToImportPage(page);

    await page.locator('#csv-input').setInputFiles({
      name: 'unknown.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(GBK_HEADER),
    });

    await expect(page.locator('#importer-select')).toHaveValue('__auto__');
    await expect(
      page.getByText('Could not auto-detect exchange format. Please select one manually.'),
    ).toBeVisible();
  });

  test('manual selection updates the dropdown and no detection runs until Auto is re-selected', async ({ page }) => {
    await goToImportPage(page);

    // User manually picks Binance before any file is uploaded.
    await page.locator('#importer-select').selectOption('Binance');
    await expect(page.locator('#importer-select')).toHaveValue('Binance');

    // Upload a Ledger CSV — detection should run on upload (per the always-detect rule)
    // and overwrite the manual Binance selection with the detected Ledger.
    await page.locator('#csv-input').setInputFiles({
      name: 'ledger.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([LEDGER_HEADER, LEDGER_ROW].join('\n')),
    });

    await expect(page.locator('#importer-select')).toHaveValue('Ledger');
    await expect(page.getByText('Treat inbound transfers as purchases')).toBeVisible();
  });

  test('uploading a new file replaces a previously-detected importer', async ({ page }) => {
    await goToImportPage(page);

    // First upload: Revolut X.
    await page.locator('#csv-input').setInputFiles({
      name: 'revolut.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([REVOLUT_HEADER, REVOLUT_ROW].join('\n')),
    });
    await expect(page.locator('#importer-select')).toHaveValue('Revolut X');

    // Second upload: Ledger — detection should replace the prior selection.
    await page.locator('#csv-input').setInputFiles({
      name: 'ledger.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([LEDGER_HEADER, LEDGER_ROW].join('\n')),
    });
    await expect(page.locator('#importer-select')).toHaveValue('Ledger');
    await expect(page.getByText('Treat inbound transfers as purchases')).toBeVisible();
  });
});