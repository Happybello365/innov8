/**
 * Visual regression tests — Trade detail page.
 *
 * Covers two distinct trade states using stable fixture data:
 *  - Active trade  (status: "active", funds in escrow)
 *  - Completed trade (status: "completed", settlement done)
 *
 * Both tests run in the chromium-desktop and chromium-mobile projects
 * configured in playwright.config.ts.
 *
 * ## Updating baselines
 *
 * When an intentional visual change is made to the trade detail page,
 * regenerate snapshots from the `frontend/` directory:
 *
 *   pnpm test:visual:update -- --grep "Trade Detail"
 *
 * Commit the updated `.png` files in the same PR as the code change.
 * Include a brief description of what changed visually and, if possible,
 * attach a before/after diff screenshot to the PR description.
 * See `tests/visual/SNAPSHOT_POLICY.md` for the full baseline-update policy.
 */

import { test, expect, FIXTURES } from './fixtures';

const API = 'http://localhost:4000';

const ACTIVE_TRADE = FIXTURES.trades[0];
const COMPLETED_TRADE = FIXTURES.trades[1];

async function waitForStable(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(150);
}

test.describe('Trade Detail — active trade state', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Ensure the active trade route is mocked (fixture.ts catches the base route;
    // override here for clarity and to guarantee the specific trade id resolves).
    await page.route(`${API}/trades/${ACTIVE_TRADE.tradeId}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ACTIVE_TRADE),
      }),
    );
  });

  test('full page layout matches snapshot (active)', async ({ authenticatedPage: page }) => {
    await page.goto(`/trades/${ACTIVE_TRADE.tradeId}`);
    await waitForStable(page);

    const main = page.locator('main, [data-testid="trade-detail"], section').first();
    await expect(main).toHaveScreenshot('trade-detail-active-main.png');
  });

  test('trade header/status badge matches snapshot (active)', async ({ authenticatedPage: page }) => {
    await page.goto(`/trades/${ACTIVE_TRADE.tradeId}`);
    await waitForStable(page);

    // Target the page body for a reliable full-page capture.
    await expect(page).toHaveScreenshot('trade-detail-active-full.png', { fullPage: true });
  });
});

test.describe('Trade Detail — completed trade state', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route(`${API}/trades/${COMPLETED_TRADE.tradeId}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(COMPLETED_TRADE),
      }),
    );
  });

  test('full page layout matches snapshot (completed)', async ({ authenticatedPage: page }) => {
    await page.goto(`/trades/${COMPLETED_TRADE.tradeId}`);
    await waitForStable(page);

    const main = page.locator('main, [data-testid="trade-detail"], section').first();
    await expect(main).toHaveScreenshot('trade-detail-completed-main.png');
  });

  test('trade header/status badge matches snapshot (completed)', async ({ authenticatedPage: page }) => {
    await page.goto(`/trades/${COMPLETED_TRADE.tradeId}`);
    await waitForStable(page);

    await expect(page).toHaveScreenshot('trade-detail-completed-full.png', { fullPage: true });
  });
});
