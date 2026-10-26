import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Lightweight crash reporting (issue #267).
 *
 * Gated behind `EXPO_PUBLIC_CRASH_REPORTING_ENABLED=true` and
 * `EXPO_PUBLIC_CRASH_REPORT_URL`. When either is missing the reporter is a
 * no-op, so local/dev builds never ship crashes anywhere.
 *
 * Every payload goes through `scrubPii` before it leaves the device,
 * consistent with docs/pii-encryption.md: manifest PII (driver name / ID,
 * vehicle registration, route description), auth material and free-text
 * contact details are redacted. Wallet addresses are public by design but
 * are still truncated so crash context can't be joined back to a user.
 */

const REDACTED = '[REDACTED]';

const PII_KEYS = new Set(
  [
    'driverName',
    'driverIdNumber',
    'vehicleRegistration',
    'routeDescription',
    'driverNameHash',
    'driverIdHash',
    'phone',
    'phoneNumber',
    'email',
    'name',
    'address',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'password',
    'secret',
    'seed',
    'privateKey',
    'signedXdr',
    'unsignedXdr',
  ].map((k) => k.toLowerCase()),
);

const STELLAR_KEY_RE = /\b[GS][A-Z2-7]{55}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const PHONE_RE = /\+?\d[\d\s-]{8,}\d/g;

export function scrubString(value: string): string {
  return value
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(STELLAR_KEY_RE, (k) => (k.startsWith('S') ? REDACTED : `${k.slice(0, 4)}…${k.slice(-4)}`))
    .replace(PHONE_RE, REDACTED);
}

export function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      const isPiiKey =
        PII_KEYS.has(lower) || lower.endsWith('address') || lower.endsWith('token');
      out[key] = isPiiKey ? REDACTED : scrubPii(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface CrashReport {
  message: string;
  stack?: string;
  isFatal: boolean;
  context?: Record<string, unknown>;
  appVersion?: string;
  platform: string;
  timestamp: string;
}

interface CrashReportingConfig {
  enabled: boolean;
  url?: string;
}

// EXPO_PUBLIC_* vars are inlined at build time, so tests override via
// `configureCrashReporting` instead of mutating process.env.
let override: CrashReportingConfig | null = null;

export function configureCrashReporting(next: CrashReportingConfig | null): void {
  override = next;
}

function config(): CrashReportingConfig {
  const enabled = override?.enabled ?? process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED === 'true';
  const url = override ? override.url : process.env.EXPO_PUBLIC_CRASH_REPORT_URL;
  return { enabled: enabled && !!url, url };
}

export function isCrashReportingEnabled(): boolean {
  return config().enabled;
}

export function buildCrashReport(
  error: unknown,
  isFatal: boolean,
  context?: Record<string, unknown>,
): CrashReport {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    message: scrubString(err.message),
    stack: err.stack ? scrubString(err.stack) : undefined,
    isFatal,
    context: context ? (scrubPii(context) as Record<string, unknown>) : undefined,
    appVersion: Constants.expoConfig?.version,
    platform: Platform.OS,
    timestamp: new Date().toISOString(),
  };
}

export async function captureException(
  error: unknown,
  context?: Record<string, unknown>,
  isFatal = false,
): Promise<void> {
  const { enabled, url } = config();
  if (!enabled || !url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCrashReport(error, isFatal, context)),
    });
  } catch {
    // Never let the reporter itself crash the app.
  }
}

interface ErrorUtilsLike {
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
}

let installed = false;

/**
 * Installs a global JS error handler that reports the crash and then
 * delegates to the previous handler (so the red box / native crash
 * behaviour is unchanged). Safe to call more than once.
 */
export function initCrashReporting(): void {
  if (installed || !isCrashReportingEnabled()) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void captureException(error, undefined, !!isFatal).finally(() => previous(error, isFatal));
  });
}
