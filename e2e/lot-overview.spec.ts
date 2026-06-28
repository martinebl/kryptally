import { test, expect } from '@playwright/test';

// Czech Republic's holding-period exemption is 3 years (1095 days) and is
// enabled starting in CZ 2025 rules. The sell must fall in 2025 so the engine
// applies those rules, splitting the disposal into one event per lot.
//
// Two BTC buys with different acquisition dates ensure the sell creates one
// long-term (LT) event and one short-term (ST) event.
//
// Binance date format: YY-MM-DD HH:mm:ss (parsed as UTC)
const BINANCE_CSV = [
  'User ID,Time,Account,Operation,Coin,Change,Remark',
  // Lot 1: bought 2019-01-15 — held ~6 years → long-term (>1095 days)
  '111,19-01-15 10:00:00,Spot,Buy,BTC,0.5,',
  // Lot 2: bought 2024-01-15 — held ~1 year → short-term (<1095 days)
  '111,24-01-15 10:00:00,Spot,Buy,BTC,0.5,',
  // Sell: 2025-01-15 — uses CZ 2025 rules (holdingPeriod.enabled=true)
  '111,25-01-15 10:00:00,Spot,Sell,BTC,-1.0,',
].join('\n');

// BTC prices in CZK returned by the mocked CoinGecko API.
// CoinGecko historical endpoint date format: DD-MM-YYYY.
const MOCK_PRICES: Record<string, number> = {
  '15-01-2019': 82000,    // cost basis for lot 1: 0.5 × 82 000 = 41 000 CZK
  '15-01-2024': 1050000,  // cost basis for lot 2: 0.5 × 1 050 000 = 525 000 CZK
  '15-01-2025': 2400000,  // sell proceeds:        1.0 × 2 400 000 = 2 400 000 CZK
};

test('lot overview: LT and ST lots expand correctly with Czech rules', async ({ page }) => {
  // Skip the 3-second rate-limit sleep between CoinGecko fetches so the
  // import completes in milliseconds rather than ~6 seconds.
  await page.addInitScript(() => {
    const orig = window.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) =>
      orig(fn, delay !== undefined && delay > 1000 ? 0 : delay, ...args);
  });

  // Mock every CoinGecko endpoint the app may call during this flow.
  await page.route('**/api.coingecko.com/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/simple/price')) {
      // Current-price endpoint (used by the holdings value panel)
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ bitcoin: { czk: 1500000 } }),
      });
      return;
    }

    if (url.includes('/history')) {
      // Historical-price endpoint: extract the date from ?date=DD-MM-YYYY
      const m = url.match(/date=(\d{2}-\d{2}-\d{4})/);
      const price = m ? (MOCK_PRICES[m[1]] ?? 1000000) : 1000000;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ market_data: { current_price: { czk: price } } }),
      });
      return;
    }

    // /coins/list and any other endpoints — BTC is hardcoded so this won't
    // actually be called, but returning [] keeps the app from erroring.
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });

  // ── 1. Select Czech Republic and navigate to Import ────────────────────
  await page.goto('/');
  await page.locator('select').first().selectOption('CZ');
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

  // ── 4. Wait for the Tax Events table ──────────────────────────────────
  // With CZ rules (holdingPeriod.enabled=true) the two-lot disposal is split
  // into one event per lot, yielding exactly two expandable disposal rows.
  const disposalRows = page
    .locator('tr[aria-expanded]')
    .filter({ has: page.getByText('Disposal') });

  await expect(disposalRows).toHaveCount(2, { timeout: 10000 });

  // ── 5. Expand the first row (LT lot — FIFO oldest first) ──────────────
  const ltRow = disposalRows.nth(0);
  await ltRow.click();
  await expect(ltRow).toHaveAttribute('aria-expanded', 'true');

  // The expanded content is the <tr> immediately after the clicked row.
  const ltExpanded = page.locator('tr[aria-expanded="true"] + tr').first();

  // Sub-header columns confirm the lot breakdown rendered
  await expect(ltExpanded.getByText('Acquired')).toBeVisible();
  await expect(ltExpanded.getByText('Consumed')).toBeVisible();

  // Long-term badge must be visible for this lot
  await expect(ltExpanded.getByText('LT')).toBeVisible();

  // Source must show exchange name, not a raw transaction ID
  await expect(ltExpanded.getByText('Binance')).toBeVisible();

  // Collapse the first row before expanding the second
  await ltRow.click();

  // ── 6. Expand the second row (ST lot — no LT badge) ───────────────────
  const stRow = disposalRows.nth(1);
  await stRow.click();
  await expect(stRow).toHaveAttribute('aria-expanded', 'true');

  const stExpanded = page.locator('tr[aria-expanded="true"] + tr').first();

  await expect(stExpanded.getByText('Acquired')).toBeVisible();
  await expect(stExpanded.getByText('Binance')).toBeVisible();

  // No LT badge on the short-term lot
  await expect(stExpanded.getByText('LT')).not.toBeVisible();
});
