import { expect, test, type Page } from "@playwright/test";

/**
 * Route smoke matrix (issue #508).
 *
 * One lightweight browser check per route group: every route must render
 * without a client-side crash, and protected routes must not leak content to
 * callers outside their group. These tests intentionally assert shell-level
 * behaviour only; feature flows live in the dedicated e2e specs.
 */

const BUYER_ADDRESS = "GBUYER3K6H6D5E7ZQY5W3J2L7F8K9B0N1M2P3Q4R5S6T7U8V9W0X1Y2";

const CRASH_PATTERN = /Application error|Unhandled Runtime Error/i;

function testJwt(walletAddress: string) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    walletAddress,
  };
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "e2e",
  ].join(".");
}

async function seedWallet(page: Page, address: string) {
  await page.addInitScript(
    ({ token, addr }) => {
      window.sessionStorage.setItem("amana_jwt", token);
      const freighter = {
        isConnected: async () => ({ isConnected: true }),
        isAllowed: async () => ({ isAllowed: true }),
        getAddress: async () => ({ address: addr }),
        requestAccess: async () => ({ address: addr }),
        signMessage: async () => ({ signedMessage: "signed-message" }),
        signTransaction: async (xdr: string) => ({ signedTxXdr: `signed-${xdr}` }),
      };
      Object.assign(window, { freighter, freighterApi: freighter });
    },
    { token: testJwt(address), addr: address },
  );
}

async function expectRouteRenders(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} HTTP status`).toBeLessThan(500);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText(CRASH_PATTERN);
}

test.describe("Route smoke matrix: unauthenticated", () => {
  const PUBLIC_ROUTES = ["/", "/help", "/access-denied"];

  for (const path of PUBLIC_ROUTES) {
    test(`public route ${path} renders`, async ({ page }) => {
      await expectRouteRenders(page, path);
    });
  }

  test("admin route redirects anonymous callers to /access-denied", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/access-denied/);
  });
});

test.describe("Route smoke matrix: buyer / seller", () => {
  const AUTHENTICATED_ROUTES = [
    "/dashboard",
    "/trades",
    "/trades/create",
    "/streams",
    "/vault",
    "/settings",
    "/reputation",
  ];

  test.beforeEach(async ({ page }) => {
    await seedWallet(page, BUYER_ADDRESS);
  });

  for (const path of AUTHENTICATED_ROUTES) {
    test(`authenticated route ${path} renders`, async ({ page }) => {
      await expectRouteRenders(page, path);
    });
  }

  test("non-admin wallet is bounced from admin routes", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/access-denied/);
  });
});

const MEDIATOR_ADDRESS = "GMEDIATOR5K6H6D5E7ZQY5W3J2L7F8K9B0N1M2P3Q4R5S6T7U8V9W0X1";
const ADMIN_ADDRESS = "GDNM7WSJ7VIUVK2TSZ2OQES5XR2663TZEIBFXRDT56B5IRLHERVWSXMU";

test.describe("Route smoke matrix: mediator", () => {
  test.beforeEach(async ({ page }) => {
    await seedWallet(page, MEDIATOR_ADDRESS);
  });

  test("mediator dispute queue renders", async ({ page }) => {
    await expectRouteRenders(page, "/mediator/disputes");
  });
});

test.describe("Route smoke matrix: admin", () => {
  const ADMIN_ROUTES = ["/admin/dashboard", "/admin/streams", "/admin/audit"];

  test.beforeEach(async ({ page }) => {
    await seedWallet(page, ADMIN_ADDRESS);
    await page.addInitScript(
      ({ addr }) => {
        (window as Window & { __NEXT_PUBLIC_ADMIN_WALLETS?: unknown }).__NEXT_PUBLIC_ADMIN_WALLETS = addr;
      },
      { addr: ADMIN_ADDRESS },
    );
  });

  for (const path of ADMIN_ROUTES) {
    test(`admin route ${path} renders for an admin wallet`, async ({ page }) => {
      await expectRouteRenders(page, path);
      await expect(page).not.toHaveURL(/\/access-denied/);
    });
  }
});
