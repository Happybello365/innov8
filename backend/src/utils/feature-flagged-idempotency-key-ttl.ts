export interface FeatureFlaggedIdempotencyKeyTtlStateInput {
  subjectKey: string;
  primaryMetric: number;
  secondaryMetric: number;
  limitUnits?: number;
}

export interface FeatureFlaggedIdempotencyKeyTtlState {
  subjectKey: string;
  primaryMetric: number;
  secondaryMetric: number;
  ratioBps: number;
  level: "nominal" | "elevated" | "critical";
  label: string;
}

export function evaluateFeatureFlaggedIdempotencyKeyTtl(input: FeatureFlaggedIdempotencyKeyTtlStateInput): FeatureFlaggedIdempotencyKeyTtlState {
  const subjectKey = input.subjectKey.trim();
  if (!subjectKey) {
    throw new Error("evaluateFeatureFlaggedIdempotencyKeyTtl: subjectKey is required");
  }
  const primaryMetric = Math.max(0, Math.trunc(input.primaryMetric));
  const secondaryMetric = Math.max(0, Math.trunc(input.secondaryMetric));
  const limitUnits = Math.max(1, Math.trunc(input.limitUnits ?? 100));

  const ratioBps = Math.min(10000, Math.round(((primaryMetric + secondaryMetric) * 10000) / limitUnits));
  let level: "nominal" | "elevated" | "critical" = "nominal";
  if (ratioBps >= 8500) {
    level = "critical";
  } else if (ratioBps >= 5000) {
    level = "elevated";
  }

  return {
    subjectKey,
    primaryMetric,
    secondaryMetric,
    ratioBps,
    level,
    label: `${subjectKey}:${level}:${ratioBps}`,
  };
}
