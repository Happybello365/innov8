import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

import {
  GUIDE_PATH,
  POLICY_PATH,
  validatePolicy,
} from "../validate-issue-triage-policy.mjs";

const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
const guide = readFileSync(GUIDE_PATH, "utf8");

function copyPolicy() {
  return structuredClone(policy);
}

describe("validate-issue-triage-policy", () => {
  it("accepts the checked-in policy and guide", () => {
    expect(validatePolicy(policy, guide)).toEqual([]);
  });

  it("runs as a CLI and reports the configured counts", () => {
    const output = execFileSync(process.execPath, [
      fileURLToPath(new URL("../validate-issue-triage-policy.mjs", import.meta.url)),
    ]);
    expect(output.toString()).toContain("[issue-triage] OK");
  });

  it("rejects a non-object policy", () => {
    expect(validatePolicy(null)).toEqual(["policy must be a JSON object"]);
    expect(validatePolicy([])).toEqual(["policy must be a JSON object"]);
  });

  it("rejects duplicate and malformed labels", () => {
    const invalid = copyPolicy();
    invalid.labels.push({ ...invalid.labels[0] });
    invalid.labels.push({
      name: "bad label!",
      color: "12345",
      description: "",
      group: "unknown",
    });

    const errors = validatePolicy(invalid);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicate label name"),
        expect.stringContaining("may only contain letters"),
        expect.stringContaining("color must be a six-digit hex value"),
        expect.stringContaining("description must be 1–100 characters"),
        expect.stringContaining('group "unknown" is not one of'),
      ]),
    );
  });

  it("requires the status and severity label set", () => {
    const invalid = copyPolicy();
    invalid.labels = invalid.labels.filter(
      (label) => label.name !== "stale" && label.name !== "severity:high",
    );

    const errors = validatePolicy(invalid);
    expect(errors).toContain('missing required status label "stale"');
    expect(errors).toContain('severities.high: label "severity:high" is not defined');
  });

  it("rejects non-positive and inverted severity targets", () => {
    const invalid = copyPolicy();
    invalid.severities.critical.firstResponseHours = 0;
    invalid.severities.critical.targetResolutionDays = 100;

    const errors = validatePolicy(invalid);
    expect(errors).toContain("severities.critical.firstResponseHours: must be a positive integer");
    expect(errors).toContain(
      "severities.targetResolutionDays: targets must not decrease as severity decreases",
    );
  });

  it("requires ownership entries to reference a defined label and paths", () => {
    const invalid = copyPolicy();
    invalid.ownership.push({ role: "Ghost owner", label: "area:missing", paths: [] });

    const errors = validatePolicy(invalid);
    expect(errors).toContain('ownership[6]: label "area:missing" is not defined');
    expect(errors).toContain(
      "ownership[6]: paths must be a non-empty array of non-empty strings",
    );
  });

  it("rejects invalid stale windows and exemptions", () => {
    const invalid = copyPolicy();
    invalid.stale.needsInfoCloseAfterDays = invalid.stale.inactiveAfterDays;
    invalid.stale.exemptLabels.push("missing-label", "needs-triage");

    const errors = validatePolicy(invalid);
    expect(errors).toContain(
      "stale.needsInfoCloseAfterDays must be less than stale.inactiveAfterDays",
    );
    expect(errors).toContain('stale.exemptLabels: "missing-label" is not a defined label');
    expect(errors).toContain(
      'stale.exemptLabels: "needs-triage" cannot be exempt from staleness',
    );
  });

  it("fails when the guide omits a configured label or required section", () => {
    const brokenGuide = guide
      .replaceAll("`bug`", "bug")
      .replace("Expected response times", "Response times")
      .replace("Stale-issue handling", "Stale handling");

    expect(validatePolicy(policy, brokenGuide)).toEqual(
      expect.arrayContaining([
        'docs guide does not document label "bug"',
        'docs guide is missing required section "Expected response times"',
        'docs guide is missing required section "Stale-issue handling"',
      ]),
    );
  });
});
