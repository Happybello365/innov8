import {
  AllRpcProvidersFailedError,
  RpcFallbackPolicy,
  parseRpcProviderUrls,
} from "../lib/stellar/rpcFallback";

describe("parseRpcProviderUrls", () => {
  it("puts primary first, trims and dedupes", () => {
    expect(parseRpcProviderUrls("https://a", " https://b, ,https://a,https://c ")).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
  });
  it("handles missing fallbacks", () => {
    expect(parseRpcProviderUrls("https://a", undefined)).toEqual(["https://a"]);
  });
});

describe("RpcFallbackPolicy", () => {
  it("requires at least one provider", () => {
    expect(() => new RpcFallbackPolicy([])).toThrow();
  });

  it("uses the primary when healthy", async () => {
    const p = new RpcFallbackPolicy(["a", "b"]);
    const fn = jest.fn(async (u: string) => u);
    await expect(p.execute(fn)).resolves.toBe("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fails over and benches the failed provider during cooldown", async () => {
    let t = 0;
    const p = new RpcFallbackPolicy(["a", "b"], { cooldownMs: 1000, now: () => t });
    const fn = jest.fn(async (u: string) => {
      if (u === "a") throw new Error("down");
      return u;
    });
    await expect(p.execute(fn)).resolves.toBe("b");
    expect(p.snapshot()[0].healthy).toBe(false);
    fn.mockClear();
    await p.execute(fn);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["b"]); // a skipped while benched
    t = 1001;
    expect(p.selectionOrder()).toEqual([0, 1]); // a eligible again after cooldown
  });

  it("respects failure threshold", async () => {
    const p = new RpcFallbackPolicy(["a", "b"], { failureThreshold: 2 });
    p.reportFailure(0);
    expect(p.snapshot()[0].healthy).toBe(true);
    p.reportFailure(0);
    expect(p.snapshot()[0].healthy).toBe(false);
  });

  it("throws without leaking URLs when all providers fail", async () => {
    const p = new RpcFallbackPolicy(["https://secret-key@a", "https://b"]);
    const err = await p.execute(async () => {
      throw new Error("boom");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AllRpcProvidersFailedError);
    expect(err.message).not.toMatch(/secret|https/);
  });
});
