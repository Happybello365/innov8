jest.mock("../config/env", () => ({
  runtimeEnvValue: (k: string) => ({ STELLAR_FEE_FLOOR_STROOPS: 100, STELLAR_FEE_CEILING_STROOPS: 5000 } as any)[k],
}));

import { assertFeeWithinBounds, FeeOutOfBoundsError } from "../services/feeEstimator.service";

describe("assertFeeWithinBounds", () => {
  const bounds = { floorStroops: 100, ceilingStroops: 5000 };

  it("accepts fees within bounds (inclusive)", () => {
    expect(assertFeeWithinBounds(100, bounds)).toBe(100);
    expect(assertFeeWithinBounds(5000, bounds)).toBe(5000);
  });

  it.each([0, 99, 5001, -1, NaN, Infinity])("rejects abnormal fee %p", (fee) => {
    expect(() => assertFeeWithinBounds(fee, bounds)).toThrow(FeeOutOfBoundsError);
  });

  it("rejects misconfigured bounds", () => {
    expect(() => assertFeeWithinBounds(200, { floorStroops: 600, ceilingStroops: 500 })).toThrow(/floor exceeds ceiling/);
  });

  it("reads bounds from env by default", () => {
    expect(() => assertFeeWithinBounds(6000)).toThrow(FeeOutOfBoundsError);
    expect(assertFeeWithinBounds(300)).toBe(300);
  });
});
