import { classifyPilotFeedback } from "../pilotFeedbackClassification";

describe("classifyPilotFeedback (#568)", () => {
  it("classifies a dispute complaint with mediation as owner", () => {
    const result = classifyPilotFeedback({
      title: "Evidence upload fails in dispute",
      content: "I cannot submit evidence for my dispute in Lagos",
    });
    expect(result.journey).toBe("dispute");
    expect(result.actionOwner).toBe("mediation");
    expect(result.region).toBe("west_africa");
  });

  it("ranks security or fund-loss language as critical", () => {
    const result = classifyPilotFeedback({
      title: "Funds missing after release",
      content: "Release completed but funds lost",
    });
    expect(result.severity).toBe("critical");
    expect(result.journey).toBe("release");
    expect(result.actionOwner).toBe("backend");
  });

  it("maps crashes to high severity and mobile delivery confirmation", () => {
    const result = classifyPilotFeedback({
      title: "App crash",
      content: "The app crashes when I confirm delivery",
    });
    expect(result.severity).toBe("high");
    expect(result.journey).toBe("delivery_confirmation");
    expect(result.actionOwner).toBe("mobile");
  });

  it("prefers an explicit region hint over text matching", () => {
    const result = classifyPilotFeedback({
      title: "Slow page",
      content: "Page is slow",
      region: "Nairobi",
    });
    expect(result.region).toBe("east_africa");
    expect(result.severity).toBe("medium");
  });

  it("falls back to other/unknown/low for unrelated feedback", () => {
    const result = classifyPilotFeedback({ title: "Nice work", content: "Thanks team" });
    expect(result).toEqual({
      journey: "other",
      severity: "low",
      region: "unknown",
      actionOwner: "product",
    });
  });

  it("never echoes free text into the classification", () => {
    const result = classifyPilotFeedback({
      title: "bob@example.com login broken",
      content: "wallet GABC123 cannot log in",
    });
    expect(JSON.stringify(result)).not.toMatch(/example\.com|GABC123/);
  });
});
