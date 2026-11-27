/**
 * Deterministic JSON serialization used for webhook signing (#472).
 *
 * - Object keys are sorted lexicographically at every depth.
 * - `undefined` values and functions are dropped from objects (as JSON.stringify does).
 * - Non-finite numbers are rejected so a signature can never cover an ambiguous value.
 * - Dates serialize via toISOString().
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakSet()));
}

function normalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot canonicalize non-finite number");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Cannot canonicalize circular structure");
    seen.add(value);
    const out = value.map((v) => (v === undefined || typeof v === "function" ? null : normalize(v, seen)));
    seen.delete(value);
    return out;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) throw new TypeError("Cannot canonicalize circular structure");
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
      out[key] = normalize(v, seen);
    }
    seen.delete(obj);
    return out;
  }
  return undefined;
}
