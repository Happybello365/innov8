import { CSP_NONCE_HEADER, readCspNonce } from "../nonce";

const headersWith = (value: string | null) => ({
  get: (name: string) => (name === CSP_NONCE_HEADER ? value : null),
});

describe("readCspNonce", () => {
  it("returns the nonce forwarded by middleware", () => {
    expect(readCspNonce(headersWith("MzJkZjJjZjg0ZDAz"))).toBe("MzJkZjJjZjg0ZDAz");
  });

  it("returns undefined when the header is missing", () => {
    expect(readCspNonce(headersWith(null))).toBeUndefined();
  });

  it("rejects values that could break out of the attribute", () => {
    expect(readCspNonce(headersWith('abc"><script>'))).toBeUndefined();
  });

  it("rejects oversized values", () => {
    expect(readCspNonce(headersWith("A".repeat(300)))).toBeUndefined();
  });
});
