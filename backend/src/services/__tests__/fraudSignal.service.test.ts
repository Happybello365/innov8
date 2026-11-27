jest.mock("../../middleware/logger", () => ({
  appLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  FraudSignalService,
  FraudSignalBlockedError,
  NoopFraudSignalProvider,
  FRAUD_SIGNAL_THRESHOLD_ENV,
  type FraudSignalContext,
  type FraudSignalProvider,
} from "../fraudSignal.service";

const ctx: FraudSignalContext = {
  buyerAddress: "GBUYER123",
  sellerAddress: "GSELLER456",
  amountUsdc: "1000",
};

function makeProvider(allowed: boolean, reason?: string): FraudSignalProvider {
  return { evaluate: jest.fn().mockResolvedValue({ allowed, reason }) };
}

function svc(threshold: string | undefined, provider: FraudSignalProvider = new NoopFraudSignalProvider()) {
  return new FraudSignalService(provider, {
    [FRAUD_SIGNAL_THRESHOLD_ENV]: threshold,
  } as NodeJS.ProcessEnv);
}

describe("FraudSignalService", () => {
  it("does nothing when threshold is unset", async () => {
    const provider = makeProvider(false, "blocked");
    await expect(svc(undefined, provider).check(ctx)).resolves.toBeUndefined();
    expect(provider.evaluate).not.toHaveBeenCalled();
  });

  it("does nothing for a trade at or below the threshold", async () => {
    const provider = makeProvider(false, "blocked");
    // threshold = 1000 USDC; amount = 1000 USDC → not strictly above
    await expect(svc("1000", provider).check(ctx)).resolves.toBeUndefined();
    expect(provider.evaluate).not.toHaveBeenCalled();
  });

  it("calls provider for trades above the threshold", async () => {
    const provider = makeProvider(true);
    // threshold = 500; amount = 1000 → fires
    await expect(svc("500", provider).check(ctx)).resolves.toBeUndefined();
    expect(provider.evaluate).toHaveBeenCalledWith(ctx);
  });

  it("throws FraudSignalBlockedError when provider rejects", async () => {
    const provider = makeProvider(false, "suspicious pattern");
    await expect(svc("500", provider).check(ctx)).rejects.toThrow(FraudSignalBlockedError);
    await expect(svc("500", provider).check(ctx)).rejects.toThrow("suspicious pattern");
  });

  it("uses a generic message when provider gives no reason", async () => {
    const provider = makeProvider(false);
    await expect(svc("500", provider).check(ctx)).rejects.toThrow("provider rejected trade");
  });

  it("NoopFraudSignalProvider always allows", async () => {
    await expect(new NoopFraudSignalProvider().evaluate(ctx)).resolves.toEqual({ allowed: true });
  });
});
