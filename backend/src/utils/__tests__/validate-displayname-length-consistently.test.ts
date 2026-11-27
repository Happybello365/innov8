import { evaluateDisplayNameLengthConsistency } from "../validate-displayname-length-consistently";

describe("evaluateDisplayNameLengthConsistency", () => {
  it("returns nominal, elevated, and critical states accurately", () => {
    expect(evaluateDisplayNameLengthConsistency({ subjectKey: "k1", primaryMetric: 10, secondaryMetric: 10, limitUnits: 100 }).level).toBe("nominal");
    expect(evaluateDisplayNameLengthConsistency({ subjectKey: "k2", primaryMetric: 40, secondaryMetric: 20 }).level).toBe("elevated");
    expect(evaluateDisplayNameLengthConsistency({ subjectKey: "k3", primaryMetric: 70, secondaryMetric: 20, limitUnits: 100 }).level).toBe("critical");
  });

  it("throws on blank subjectKey", () => {
    expect(() => evaluateDisplayNameLengthConsistency({ subjectKey: "  ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/subjectKey is required/);
  });
});
