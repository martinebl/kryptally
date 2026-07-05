import { test, expect } from '@playwright/test';

// Regression test for a bug where the expanded-row "pooled" banner and
// "Pooled Since" header keyed off the page-level cost-basis method rather
// than whether the disposal's lot was actually blended. A single purchase
// under the "average" method is never pooled (LotTracker.consolidateToAverage
// is a no-op for one lot), so it must render exactly like a FIFO lot: real
// source label, "Acquired" header, no pooling banner — while still correctly
// getting the long-term badge.
//
// Binance date format: YY-MM-DD HH:mm:ss (parsed as UTC)
const BINANCE_CSV = [
  'User ID,Time,Account,Operation,Coin,Change,Remark',
  // Single BTC buy, held ~6.5 years — well past CZ's 3-year (1095-day) threshold
  '111,19-01-15 10:00:00,Spot,Buy,BTC,1,',
  // Sell in 2025 so CZ's holdingPeriod.enabled rules apply
  '111,25-06-01 10:00:00,Spot,Sell,BTC,-1,',
].join('\n');

// BTC prices in CZK returned by the mocked CoinGecko API.
// CoinGecko historical endpoint date format: DD-MM-YYYY.
const MOCK_PRICES: Record<string, number> = {
  '15-01-2019': 82000,    // cost basis: 1 × 82 000 = 82 000 CZK
  '01-06-2025': 2500000,  // proceeds:    1 × 2 500 000 = 2 500 000 CZK
};

test('single-lot disposal under "average" method never shows the pooling banner', async ({ page }) => {
  // Skip the 3-second rate-limit sleep between CoinGecko fetches.
  await page.addInitScript(() => {
    const orig = window.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) =>
      orig(fn, delay !== undefined && delay > 1000 ? 0 : delay, ...args);
  });

  await page.route('**/api.coingecko.com/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/simple/price')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ bitcoin: { czk: 2500000 } }),
      });
      return;
    }

    if (url.includes('/history')) {
      const m = url.match(/date=(\d{2}-\d{2}-\d{4})/);
      const price = m ? (MOCK_PRICES[m[1]] ?? 1000000) : 1000000;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ market_data: { current_price: { czk: price } } }),
      });
      return;
    }

    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });

  // ── 1. Select Czech Republic, then the AVERAGE cost-basis method ──────
  await page.goto('/');
  await page.locator('select').first().selectOption('CZ');
  await page.getByRole('button', { name: 'AVERAGE' }).click();
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Import transactions' })).toBeVisible();

  // ── 2. Upload the Binance CSV ──────────────────────────────────────────
  await page.locator('#csv-input').setInputFiles({
    name: 'binance.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(BINANCE_CSV),
  });
  await expect(page.locator('#importer-select')).toHaveValue('Binance');

  // ── 3. Import and wait for enrichment ─────────────────────────────────
  await page.getByRole('main').getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('button', { name: /view results/i })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: /view results/i }).click();

  // ── 4. Expand the single disposal row ──────────────────────────────────
  const disposalRow = page
    .locator('tr[aria-expanded]')
    .filter({ has: page.getByText('Disposal') });

  await expect(disposalRow).toHaveCount(1, { timeout: 10000 });
  await disposalRow.click();
  await expect(disposalRow).toHaveAttribute('aria-expanded', 'true');

  const expanded = page.locator('tr[aria-expanded="true"] + tr').first();

  // Real acquisition date shown, not a synthetic pooled date
  await expect(expanded.getByText('Acquired')).toBeVisible();
  await expect(expanded.getByText('Pooled Since')).not.toBeVisible();

  // No pooling banner for a lot that was never actually blended
  await expect(page.getByText('Pooled disposals never qualify')).not.toBeVisible();

  // Long-term badge still correctly applies
  await expect(expanded.getByText('LT')).toBeVisible();

  // Source shows the real exchange name, not the "Weighted avg" badge
  await expect(expanded.getByText('Binance')).toBeVisible();
  await expect(expanded.getByText('Weighted avg')).not.toBeVisible();
});
