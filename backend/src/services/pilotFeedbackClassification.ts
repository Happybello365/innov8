/**
 * Pilot feedback classification (#568).
 *
 * Pure, dependency-free categorisation of a pilot feedback item by journey,
 * severity, region and action owner. Used to enrich SLA-violation alerts so
 * on-call and the pilot team can triage without opening every item.
 *
 * No PII is produced: the output contains only enumerated labels, never the
 * submitter, free text, or wallet addresses.
 */

export const PILOT_JOURNEYS = [
  "auth",
  "trade_create",
  "funding",
  "delivery_confirmation",
  "release",
  "dispute",
  "other",
] as const;
export type PilotJourney = (typeof PILOT_JOURNEYS)[number];

export const PILOT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type PilotSeverity = (typeof PILOT_SEVERITIES)[number];

export const PILOT_REGIONS = ["west_africa", "east_africa", "southern_africa", "unknown"] as const;
export type PilotRegion = (typeof PILOT_REGIONS)[number];

export const PILOT_ACTION_OWNERS = ["backend", "frontend", "mobile", "mediation", "product"] as const;
export type PilotActionOwner = (typeof PILOT_ACTION_OWNERS)[number];

export interface PilotFeedbackClassification {
  journey: PilotJourney;
  severity: PilotSeverity;
  region: PilotRegion;
  actionOwner: PilotActionOwner;
}

export interface PilotFeedbackInput {
  title: string;
  content: string;
  /** Optional region hint supplied by the pilot form (free text). */
  region?: string | null;
}

/** Ordered: the first journey whose keywords match wins. */
const JOURNEY_KEYWORDS: ReadonlyArray<readonly [PilotJourney, RegExp]> = [
  ["dispute", /\b(dispute|mediat|evidence|appeal)/i],
  ["release", /\b(release|payout|settle|withdraw)/i],
  ["delivery_confirmation", /\b(confirm|delivery|delivered|pod|proof of delivery)/i],
  ["funding", /\b(fund|deposit|escrow balance|top ?up)/i],
  ["trade_create", /\b(create trade|new trade|listing|create)/i],
  ["auth", /\b(login|log in|sign ?in|wallet connect|otp|password|auth)/i],
];

const SEVERITY_KEYWORDS: ReadonlyArray<readonly [PilotSeverity, RegExp]> = [
  ["critical", /\b(funds? (lost|missing)|data leak|cannot (access|withdraw)|crash(es|ed)? every|security)/i],
  ["high", /\b(crash|blocked|broken|error|fails?|failed|stuck)/i],
  ["medium", /\b(slow|confusing|wrong|incorrect|timeout)/i],
];

const REGION_KEYWORDS: ReadonlyArray<readonly [PilotRegion, RegExp]> = [
  ["west_africa", /\b(nigeria|ghana|senegal|ivory coast|côte d'ivoire|kano|lagos|accra|west africa)/i],
  ["east_africa", /\b(kenya|uganda|tanzania|rwanda|ethiopia|nairobi|east africa)/i],
  ["southern_africa", /\b(zambia|zimbabwe|malawi|mozambique|south africa|southern africa)/i],
];

const OWNER_BY_JOURNEY: Record<PilotJourney, PilotActionOwner> = {
  auth: "frontend",
  trade_create: "frontend",
  funding: "backend",
  delivery_confirmation: "mobile",
  release: "backend",
  dispute: "mediation",
  other: "product",
};

function firstMatch<T extends string>(
  text: string,
  rules: ReadonlyArray<readonly [T, RegExp]>,
  fallback: T,
): T {
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) return label;
  }
  return fallback;
}

/** Map a free-text region hint to a known region; unknown hints fall through to text matching. */
function resolveRegion(input: PilotFeedbackInput): PilotRegion {
  const hint = input.region?.trim();
  if (hint) {
    const fromHint = firstMatch(hint, REGION_KEYWORDS, "unknown");
    if (fromHint !== "unknown") return fromHint;
  }
  return firstMatch(`${input.title} ${input.content}`, REGION_KEYWORDS, "unknown");
}

export function classifyPilotFeedback(input: PilotFeedbackInput): PilotFeedbackClassification {
  const text = `${input.title}\n${input.content}`;
  const journey = firstMatch(text, JOURNEY_KEYWORDS, "other");
  return {
    journey,
    severity: firstMatch(text, SEVERITY_KEYWORDS, "low"),
    region: resolveRegion(input),
    actionOwner: OWNER_BY_JOURNEY[journey],
  };
}
