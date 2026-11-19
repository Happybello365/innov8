import {
  findDisputeIdForTrade,
  SETTLEMENT_OUTCOME_STATUSES,
} from "../../scripts/lib/synthetic-dispute";

describe("synthetic dispute journey helpers (#565)", () => {
  it("finds the dispute for the probe trade in an array payload", () => {
    const payload = [
      { id: "d-1", tradeId: "t-other" },
      { id: "d-2", tradeId: "t-probe" },
    ];
    expect(findDisputeIdForTrade(payload, "t-probe")).toBe("d-2");
  });

  it("accepts paginated { items } and { data } payloads", () => {
    expect(findDisputeIdForTrade({ items: [{ id: "d-9", tradeId: "t-1" }] }, "t-1")).toBe("d-9");
    expect(findDisputeIdForTrade({ data: [{ id: "d-8", tradeId: "t-2" }] }, "t-2")).toBe("d-8");
  });

  it("fails closed when no dispute matches the probe trade", () => {
    expect(() => findDisputeIdForTrade([{ id: "d-1", tradeId: "other" }], "t-probe")).toThrow(
      "No mediator dispute found for trade t-probe",
    );
    expect(() => findDisputeIdForTrade(null, "t-probe")).toThrow(/No mediator dispute/);
  });

  it("accepts only terminal settlement statuses as outcomes", () => {
    expect(SETTLEMENT_OUTCOME_STATUSES).toEqual(["COMPLETED", "CANCELLED", "DISPUTED"]);
    expect(SETTLEMENT_OUTCOME_STATUSES).not.toContain("FUNDED");
  });
});
