import { evaluateCsvExportWithSelectableColumns } from "../csv-export-with-selectable-columns";

describe("evaluateCsvExportWithSelectableColumns", () => {
  it("returns nominal level when combined metrics remain below 50% of limitUnits", () => {
    const res = evaluateCsvExportWithSelectableColumns({
      subjectKey: "item-nominal",
      primaryMetric: 20,
      secondaryMetric: 10,
      limitUnits: 100,
    });
    expect(res.level).toBe("nominal");
    expect(res.ratioBps).toBe(3000);
    expect(res.label).toBe("item-nominal:nominal:3000");
  });

  it("returns elevated level when ratioBps is between 5000 and 8499", () => {
    const res = evaluateCsvExportWithSelectableColumns({
      subjectKey: "item-elevated",
      primaryMetric: 40,
      secondaryMetric: 20,
    });
    expect(res.level).toBe("elevated");
    expect(res.ratioBps).toBe(6000);
  });

  it("returns critical level when ratioBps reaches or exceeds 8500", () => {
    const res = evaluateCsvExportWithSelectableColumns({
      subjectKey: "item-critical",
      primaryMetric: 70,
      secondaryMetric: 25,
      limitUnits: 100,
    });
    expect(res.level).toBe("critical");
    expect(res.ratioBps).toBe(9500);
  });

  it("throws when subjectKey is blank", () => {
    expect(() =>
      evaluateCsvExportWithSelectableColumns({
        subjectKey: "   ",
        primaryMetric: 1,
        secondaryMetric: 1,
      }),
    ).toThrow(/subjectKey is required/);
  });
});
