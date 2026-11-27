/**
 * Central delivery-preference validation run before a notification is scheduled (#474).
 * Combines opt-out, channel, locale and quiet-hours rules into one decision.
 */
import {
  CRITICAL_NOTIFICATION_TYPES,
  QuietHoursPreference,
  isInQuietHours,
} from "../routes/notifications.preferences.routes";

export type NotificationChannel = "email" | "push" | "in-app";
export const SUPPORTED_CHANNELS: readonly NotificationChannel[] = ["email", "push", "in-app"];
export const SUPPORTED_LOCALES: readonly string[] = ["en", "fr", "es", "pt", "sw", "ha", "yo"];
export const DEFAULT_LOCALE = "en";

export interface DeliveryPreferenceInput {
  type: string;
  channel: string;
  locale?: string | null;
  preferences?: {
    channels?: Record<string, string[]>;
    quietHours?: QuietHoursPreference;
    optOut?: boolean;
  } | null;
  now?: Date;
}

export type DeliveryDecision =
  | { action: "send"; channel: NotificationChannel; locale: string }
  | { action: "defer"; channel: NotificationChannel; locale: string; reason: "quiet_hours" }
  | { action: "drop"; reason: "invalid_channel" | "opted_out" | "channel_disabled" };

/** Resolves a requested locale (e.g. "fr-CA") to a supported one, falling back to English. */
export function resolveLocale(locale?: string | null): string {
  if (!locale || typeof locale !== "string") return DEFAULT_LOCALE;
  const base = locale.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

function isQuietHoursActive(qh: QuietHoursPreference | undefined, now: Date): boolean {
  if (!qh) return false;
  try {
    return isInQuietHours(qh, now);
  } catch {
    // Invalid stored timezone: fail open rather than silently suppressing delivery.
    return false;
  }
}

export function evaluateDeliveryPreferences(input: DeliveryPreferenceInput): DeliveryDecision {
  const channel = input.channel as NotificationChannel;
  if (!SUPPORTED_CHANNELS.includes(channel)) return { action: "drop", reason: "invalid_channel" };

  const critical = CRITICAL_NOTIFICATION_TYPES.has(input.type);
  const prefs = input.preferences ?? {};
  const locale = resolveLocale(input.locale);

  // Critical notifications always go through in-app even when the user has opted out elsewhere.
  if (prefs.optOut && !(critical && channel === "in-app")) return { action: "drop", reason: "opted_out" };

  const configured = prefs.channels?.[input.type];
  if (Array.isArray(configured) && !configured.includes(channel) && !critical) {
    return { action: "drop", reason: "channel_disabled" };
  }

  if (!critical && isQuietHoursActive(prefs.quietHours, input.now ?? new Date())) {
    return { action: "defer", channel, locale, reason: "quiet_hours" };
  }

  return { action: "send", channel, locale };
}
