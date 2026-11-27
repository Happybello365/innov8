import {
  checkWalletNetwork,
  compareNetwork,
  networkLabel,
  signWithTimeout,
  SigningTimeoutError,
} from "../signing";

const TESTNET = "Test SDF Network ; September 2015";
const PUBLIC = "Public Global Stellar Network ; September 2015";

describe("wallet signing guards", () => {
  it("labels known networks", () => {
    expect(networkLabel(TESTNET)).toBe("TESTNET");
    expect(networkLabel(PUBLIC)).toBe("PUBLIC");
    expect(networkLabel(null)).toBe("UNKNOWN");
  });

  it("detects a network mismatch", () => {
    expect(compareNetwork(PUBLIC, TESTNET)).toEqual({ ok: false, expected: "TESTNET", actual: "PUBLIC" });
    expect(compareNetwork(TESTNET, TESTNET).ok).toBe(true);
  });

  it("does not block when the wallet cannot report its network", async () => {
    expect((await checkWalletNetwork(undefined, TESTNET)).ok).toBe(true);
    expect((await checkWalletNetwork(() => Promise.reject(new Error("x")), TESTNET)).ok).toBe(true);
    expect((await checkWalletNetwork(() => Promise.resolve({ error: "locked" }), TESTNET)).ok).toBe(true);
  });

  it("reports mismatch from getNetworkDetails", async () => {
    const res = await checkWalletNetwork(() => Promise.resolve({ networkPassphrase: PUBLIC }), TESTNET);
    expect(res).toEqual({ ok: false, expected: "TESTNET", actual: "PUBLIC" });
  });

  it("resolves when signing completes in time", async () => {
    await expect(signWithTimeout(() => Promise.resolve("signed"), 50)).resolves.toBe("signed");
  });

  it("rejects with SigningTimeoutError when the wallet stalls", async () => {
    jest.useFakeTimers();
    const p = signWithTimeout(() => new Promise(() => {}), 1000);
    jest.advanceTimersByTime(1000);
    await expect(p).rejects.toBeInstanceOf(SigningTimeoutError);
    jest.useRealTimers();
  });

  it("propagates signing errors", async () => {
    await expect(signWithTimeout(() => Promise.reject(new Error("declined")), 50)).rejects.toThrow("declined");
  });
});
