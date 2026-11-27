jest.mock("../../middleware/logger", () => ({
  appLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../lib/cache", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../lib/redis", () => ({ redis: {} }));
jest.mock("../../services/alert.service", () => ({
  alertService: { dispatch: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("../../services/stellar.service");

import { TreasuryReconciliationService } from "../treasuryReconciliation.service";
import { StellarService } from "../stellar.service";
import { alertService } from "../alert.service";

const MockStellarService = StellarService as jest.MockedClass<typeof StellarService>;

function makeService(onChainBalance: string, trades: { amountUsdc: string }[]) {
  MockStellarService.prototype.getAccountBalance = jest.fn().mockResolvedValue(onChainBalance);
  const prisma = {
    trade: {
      findMany: jest.fn().mockResolvedValue(trades),
    },
  } as any;
  return new TreasuryReconciliationService(prisma);
}

describe("TreasuryReconciliationService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns none severity when there is no drift", async () => {
    // 2 trades × 100 USDC = 2,000,000,000 stroops; on-chain matches exactly
    const svc = makeService("2000000000", [{ amountUsdc: "100" }, { amountUsdc: "100" }]);
    const report = await svc.run();
    expect(report.severity).toBe("none");
    expect(report.drift).toBe("0");
    expect(alertService.dispatch).not.toHaveBeenCalled();
  });

  it("detects a warning-level drift and dispatches an alert", async () => {
    // DB expects 1,000,000,000 stroops (100 USDC), on-chain has 10% more
    const svc = makeService("1100000000", [{ amountUsdc: "100" }]);
    const report = await svc.run();
    expect(report.severity).toBe("warning");
    expect(alertService.dispatch).toHaveBeenCalledWith(
      "treasury_reconciliation_warning",
      expect.stringContaining("warning"),
      expect.any(Object),
    );
  });

  it("detects a critical drift and dispatches a critical alert", async () => {
    // DB expects 1,000,000,000 stroops, on-chain is double → 10,000 bps drift
    const svc = makeService("2000000000", [{ amountUsdc: "100" }]);
    const report = await svc.run();
    expect(report.severity).toBe("critical");
    expect(alertService.dispatch).toHaveBeenCalledWith(
      "treasury_reconciliation_critical",
      expect.stringContaining("critical"),
      expect.any(Object),
    );
  });

  it("includes the active trade count in the report", async () => {
    const svc = makeService("3000000000", [
      { amountUsdc: "100" },
      { amountUsdc: "100" },
      { amountUsdc: "100" },
    ]);
    const report = await svc.run();
    expect(report.activeTrades).toBe(3);
  });
});
