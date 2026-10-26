import { z } from "zod";

/** Known currency field names across request payloads and query parameters. */
export const CURRENCY_FIELD_NAMES: ReadonlySet<string> = new Set([
  "currency",
  "currencyCode",
  "asset",
  "sourceAsset",
  "destinationAsset",
  "token",
]);

/**
 * Normalizes a currency code to uppercase string (trimmed).
 * If the value is not a string, it is returned unchanged.
 */
export function normalizeCurrencyCode(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim().toUpperCase();
  }
  return value;
}

/**
 * Normalizes all currency code fields in an object (or array) to uppercase
 * before they reach Zod or other validator schemas.
 */
export function normalizeCurrencyFields<T>(input: T): T {
  if (!input || typeof input !== "object") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => normalizeCurrencyFields(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (CURRENCY_FIELD_NAMES.has(key)) {
      result[key] = normalizeCurrencyCode(value);
    } else if (value && typeof value === "object") {
      result[key] = normalizeCurrencyFields(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Zod schema for currency code: normalizes input to uppercase before validation.
 */
export const currencyCodeSchema = z.preprocess(
  (val) => normalizeCurrencyCode(val),
  z.string().min(1, "Currency code cannot be empty"),
);
