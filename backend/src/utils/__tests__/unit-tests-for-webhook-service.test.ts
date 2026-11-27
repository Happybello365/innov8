import { evaluateWebhookServiceAudit } from "../unit-tests-for-webhook-service";

describe("evaluateWebhookServiceAudit", () => {
  it("returns nominal, elevated, and critical states accurately", () => {
    expect(evaluateWebhookServiceAudit({ subjectKey: "k1", primaryMetric: 10, secondaryMetric: 10, limitUnits: 100 }).level).toBe("nominal");
    expect(evaluateWebhookServiceAudit({ subjectKey: "k2", primaryMetric: 40, secondaryMetric: 20 }).level).toBe("elevated");
    expect(evaluateWebhookServiceAudit({ subjectKey: "k3", primaryMetric: 70, secondaryMetric: 20, limitUnits: 100 }).level).toBe("critical");
  });

  it("throws on blank subjectKey", () => {
    expect(() => evaluateWebhookServiceAudit({ subjectKey: "  ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/subjectKey is required/);
  });
});
