import { evaluateTradeRepoDocumentation } from "../document-public-methods-in-trade-repo";

describe("evaluateTradeRepoDocumentation", () => {
  it("returns nominal, elevated, and critical states accurately", () => {
    expect(evaluateTradeRepoDocumentation({ subjectKey: "k1", primaryMetric: 10, secondaryMetric: 10, limitUnits: 100 }).level).toBe("nominal");
    expect(evaluateTradeRepoDocumentation({ subjectKey: "k2", primaryMetric: 40, secondaryMetric: 20 }).level).toBe("elevated");
    expect(evaluateTradeRepoDocumentation({ subjectKey: "k3", primaryMetric: 70, secondaryMetric: 20, limitUnits: 100 }).level).toBe("critical");
  });

  it("throws on blank subjectKey", () => {
    expect(() => evaluateTradeRepoDocumentation({ subjectKey: "  ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/subjectKey is required/);
  });
});
