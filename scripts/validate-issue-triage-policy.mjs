#!/usr/bin/env node
/**
 * validate-issue-triage-policy.mjs
 *
 * Validates `.github/issue-triage-policy.json` and confirms that every label in
 * the policy is documented in `docs/contributor-issue-triage.md`.
 *
 * The policy is the machine-readable source of truth for issue labels,
 * severity response targets, area ownership, and stale-issue thresholds. The
 * guide is what contributors and maintainers read, so the two must not drift.
 *
 * Exit codes:
 *   0 — policy and guide are valid
 *   1 — validation errors found (details are printed)
 *
 * Usage:
 *   node scripts/validate-issue-triage-policy.mjs
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const POLICY_PATH = resolve(__dirname, "../.github/issue-triage-policy.json");
export const GUIDE_PATH = resolve(__dirname, "../docs/contributor-issue-triage.md");

export const ALLOWED_GROUPS = [
  "type",
  "area",
  "severity",
  "status",
  "contributor",
  "resolution",
];
export const REQUIRED_STATUS_LABELS = [
  "needs-triage",
  "needs-info",
  "confirmed",
  "blocked",
  "stale",
];
export const SEVERITY_KEYS = ["critical", "high", "medium", "low"];
const LABEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 :/_-]*$/;
const COLOR_PATTERN = /^[0-9a-f]{6}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate a parsed policy object.
 *
 * @param {unknown} policy Parsed `.github/issue-triage-policy.json`.
 * @param {string | null} [guideText] Optional guide contents for coverage checks.
 * @returns {string[]} Validation errors; empty means valid.
 */
export function validatePolicy(policy, guideText = null) {
  const errors = [];

  if (!isPlainObject(policy)) {
    return ["policy must be a JSON object"];
  }
  if (policy.version !== 1) {
    errors.push('version must be 1');
  }
  if (!Array.isArray(policy.labels) || policy.labels.length === 0) {
    errors.push("labels must be a non-empty array");
  }

  const labels = Array.isArray(policy.labels) ? policy.labels : [];
  const labelsByName = new Map();
  const seenNames = new Set();

  labels.forEach((label, index) => {
    const where = `labels[${index}]`;
    if (!isPlainObject(label)) {
      errors.push(`${where}: must be an object`);
      return;
    }

    if (typeof label.name !== "string" || label.name.trim() === "") {
      errors.push(`${where}: name must be a non-empty string`);
    } else {
      const name = label.name;
      if (name.length > 50) {
        errors.push(`${where}: name "${name}" exceeds GitHub's 50-character limit`);
      }
      if (!LABEL_NAME_PATTERN.test(name)) {
        errors.push(
          `${where}: name "${name}" may only contain letters, numbers, spaces, and : / _ -`,
        );
      }
      const normalized = name.toLowerCase();
      if (seenNames.has(normalized)) {
        errors.push(`${where}: duplicate label name "${name}"`);
      }
      seenNames.add(normalized);
      labelsByName.set(name, label);
    }

    if (typeof label.color !== "string" || !COLOR_PATTERN.test(label.color)) {
      errors.push(`${where}: color must be a six-digit hex value without "#"`);
    }
    if (
      typeof label.description !== "string" ||
      label.description.trim() === "" ||
      label.description.length > 100
    ) {
      errors.push(`${where}: description must be 1–100 characters`);
    }
    if (!ALLOWED_GROUPS.includes(label.group)) {
      errors.push(
        `${where}: group "${label.group}" is not one of [${ALLOWED_GROUPS.join(", ")}]`,
      );
    }
  });

  for (const required of REQUIRED_STATUS_LABELS) {
    if (!labelsByName.has(required)) {
      errors.push(`missing required status label "${required}"`);
    }
  }

  if (!isPlainObject(policy.severities)) {
    errors.push("severities must be an object");
  } else {
    const keys = Object.keys(policy.severities);
    for (const key of SEVERITY_KEYS) {
      if (!keys.includes(key)) {
        errors.push(`severities: missing "${key}"`);
      }
    }
    for (const key of keys) {
      const severity = policy.severities[key];
      if (!SEVERITY_KEYS.includes(key)) {
        errors.push(`severities: unknown key "${key}"`);
        continue;
      }
      if (!isPlainObject(severity)) {
        errors.push(`severities.${key}: must be an object`);
        continue;
      }
      const label = labelsByName.get(severity.label);
      if (!label) {
        errors.push(`severities.${key}: label "${severity.label}" is not defined`);
      } else if (label.group !== "severity") {
        errors.push(`severities.${key}: label "${severity.label}" must use group "severity"`);
      }
      for (const field of [
        "firstResponseHours",
        "triageBusinessDays",
        "updateEveryHours",
        "targetResolutionDays",
      ]) {
        if (!isPositiveInteger(severity[field])) {
          errors.push(`severities.${key}.${field}: must be a positive integer`);
        }
      }
    }

    if (SEVERITY_KEYS.every((key) => isPlainObject(policy.severities[key]))) {
      for (const field of [
        "firstResponseHours",
        "triageBusinessDays",
        "updateEveryHours",
        "targetResolutionDays",
      ]) {
        const values = SEVERITY_KEYS.map((key) => policy.severities[key][field]);
        const increasing = values.every(
          (value, index) =>
            !isPositiveInteger(value) ||
            index === 0 ||
            !isPositiveInteger(values[index - 1]) ||
            value >= values[index - 1],
        );
        if (!increasing) {
          errors.push(`severities.${field}: targets must not decrease as severity decreases`);
        }
      }
    }
  }

  if (!Array.isArray(policy.ownership) || policy.ownership.length === 0) {
    errors.push("ownership must be a non-empty array");
  } else {
    const roles = new Set();
    policy.ownership.forEach((owner, index) => {
      const where = `ownership[${index}]`;
      if (!isPlainObject(owner)) {
        errors.push(`${where}: must be an object`);
        return;
      }
      if (typeof owner.role !== "string" || owner.role.trim() === "") {
        errors.push(`${where}: role must be a non-empty string`);
      } else if (roles.has(owner.role)) {
        errors.push(`${where}: duplicate role "${owner.role}"`);
      } else {
        roles.add(owner.role);
      }
      if (!labelsByName.has(owner.label)) {
        errors.push(`${where}: label "${owner.label}" is not defined`);
      }
      if (
        !Array.isArray(owner.paths) ||
        owner.paths.length === 0 ||
        owner.paths.some((path) => typeof path !== "string" || path.trim() === "")
      ) {
        errors.push(`${where}: paths must be a non-empty array of non-empty strings`);
      }
    });
  }

  if (!isPlainObject(policy.stale)) {
    errors.push("stale must be an object");
  } else {
    const stale = policy.stale;
    for (const field of [
      "needsInfoAfterDays",
      "needsInfoCloseAfterDays",
      "inactiveAfterDays",
      "closeAfterDays",
    ]) {
      if (!isPositiveInteger(stale[field])) {
        errors.push(`stale.${field}: must be a positive integer`);
      }
    }
    if (
      isPositiveInteger(stale.needsInfoCloseAfterDays) &&
      isPositiveInteger(stale.inactiveAfterDays) &&
      stale.needsInfoCloseAfterDays >= stale.inactiveAfterDays
    ) {
      errors.push("stale.needsInfoCloseAfterDays must be less than stale.inactiveAfterDays");
    }
    if (
      isPositiveInteger(stale.closeAfterDays) &&
      isPositiveInteger(stale.inactiveAfterDays) &&
      stale.closeAfterDays >= stale.inactiveAfterDays
    ) {
      errors.push("stale.closeAfterDays must be less than stale.inactiveAfterDays");
    }

    const exempt = stale.exemptLabels;
    if (!Array.isArray(exempt) || exempt.length === 0) {
      errors.push("stale.exemptLabels must be a non-empty array");
    } else {
      const seen = new Set();
      for (const label of exempt) {
        if (typeof label !== "string" || !labelsByName.has(label)) {
          errors.push(`stale.exemptLabels: "${label}" is not a defined label`);
        }
        if (seen.has(label)) {
          errors.push(`stale.exemptLabels: duplicate "${label}"`);
        }
        seen.add(label);
      }
      for (const forbidden of ["needs-triage", "stale"]) {
        if (exempt.includes(forbidden)) {
          errors.push(`stale.exemptLabels: "${forbidden}" cannot be exempt from staleness`);
        }
      }
    }
  }

  if (guideText !== null) {
    for (const name of labelsByName.keys()) {
      const documented = new RegExp("`" + escapeRegExp(name) + "`").test(guideText);
      if (!documented) {
        errors.push(`docs guide does not document label "${name}"`);
      }
    }
    for (const requiredPhrase of ["Expected response times", "Stale-issue handling"]) {
      if (!guideText.includes(requiredPhrase)) {
        errors.push(`docs guide is missing required section "${requiredPhrase}"`);
      }
    }
  }

  return errors;
}

function main() {
  let policy;
  let guide;
  try {
    policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
  } catch (error) {
    console.error(`[issue-triage] ERROR: cannot read policy at ${POLICY_PATH}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
  try {
    guide = readFileSync(GUIDE_PATH, "utf8");
  } catch (error) {
    console.error(`[issue-triage] ERROR: cannot read guide at ${GUIDE_PATH}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }

  const errors = validatePolicy(policy, guide);
  if (errors.length > 0) {
    console.error(`[issue-triage] FAILED — ${errors.length} error(s):`);
    for (const error of errors) {
      console.error(`  ✗  ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[issue-triage] OK — ${policy.labels.length} labels, ${Object.keys(policy.severities).length} severity levels, and ${policy.ownership.length} ownership areas validated.`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
