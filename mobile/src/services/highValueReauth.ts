import * as LocalAuthentication from 'expo-local-authentication';
import { featuresApi, type ClientFeatureFlag } from '../api/features';

/**
 * Re-authentication for high-value trade confirmations (#269).
 *
 * Above a threshold, confirming delivery or releasing funds first requires a
 * fresh biometric check, falling back to the device passcode. The threshold
 * comes from the `high_value_trade_reauth` feature flag (`value` = USDC).
 */
export const HIGH_VALUE_REAUTH_FLAG = 'high_value_trade_reauth';

/**
 * Threshold used when the flag cannot be read (offline, API error). Failing
 * safe: re-auth is still required for large trades rather than silently skipped.
 */
export const DEFAULT_HIGH_VALUE_THRESHOLD_USDC = 1000;

export interface ReauthPolicy {
  enabled: boolean;
  thresholdUsdc: number;
  source: 'flag' | 'default';
}

export type ReauthOutcome =
  | { ok: true; required: boolean }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unavailable'; message: string };

type LocalAuth = Pick<
  typeof LocalAuthentication,
  'hasHardwareAsync' | 'isEnrolledAsync' | 'getEnrolledLevelAsync' | 'authenticateAsync'
>;

const STROOPS_PER_UNIT = 10_000_000n;

/** Parse a decimal amount string into 7-decimal fixed point; null when malformed. */
export function toStroops(amount: string | number): bigint | null {
  const text = String(amount).trim();
  const match = /^(\d+)(?:\.(\d{0,7})\d*)?$/.exec(text);
  if (!match) return null;
  const [, whole, frac = ''] = match;
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(frac.padEnd(7, '0'));
}

/** Policy from a resolved flag; any error or missing value yields the safe default. */
export function policyFromFlag(flag: ClientFeatureFlag | null): ReauthPolicy {
  if (!flag) return { enabled: true, thresholdUsdc: DEFAULT_HIGH_VALUE_THRESHOLD_USDC, source: 'default' };
  const value = typeof flag.value === 'number' && Number.isFinite(flag.value) && flag.value >= 0
    ? flag.value
    : DEFAULT_HIGH_VALUE_THRESHOLD_USDC;
  return { enabled: flag.enabled, thresholdUsdc: value, source: 'flag' };
}

export async function loadReauthPolicy(api = featuresApi): Promise<ReauthPolicy> {
  try {
    return policyFromFlag(await api.getFlag(HIGH_VALUE_REAUTH_FLAG));
  } catch {
    return policyFromFlag(null);
  }
}

/**
 * True when `amountUsdc` is strictly above the threshold. A malformed amount
 * counts as high value so a parsing bug can never bypass the check.
 */
export function requiresReauth(amountUsdc: string | number, policy: ReauthPolicy): boolean {
  if (!policy.enabled) return false;
  const amount = toStroops(amountUsdc);
  const threshold = toStroops(policy.thresholdUsdc.toFixed(7));
  if (amount === null || threshold === null) return true;
  return amount > threshold;
}

/**
 * Prompt for biometric (or device passcode) authentication. Blocks when the
 * device has no enrolled biometrics *and* no passcode — there is nothing to
 * re-authenticate with.
 */
export async function reauthenticate(promptMessage: string, auth: LocalAuth = LocalAuthentication): Promise<ReauthOutcome> {
  try {
    const level = await auth.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Set up a device passcode or biometrics to confirm high-value trades.',
      };
    }
    const result = await auth.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true, required: true };
    const cancelled = result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel';
    return cancelled
      ? { ok: false, reason: 'cancelled', message: 'Authentication was cancelled.' }
      : { ok: false, reason: 'failed', message: 'Authentication failed. The trade was not confirmed.' };
  } catch {
    return { ok: false, reason: 'failed', message: 'Authentication failed. The trade was not confirmed.' };
  }
}

/**
 * Gate a high-value action. Resolves `{ ok: true, required: false }` without
 * prompting for trades at or below the threshold.
 */
export async function guardHighValueAction(
  amountUsdc: string | number,
  promptMessage: string,
  deps: { policy?: ReauthPolicy; auth?: LocalAuth; api?: typeof featuresApi } = {},
): Promise<ReauthOutcome> {
  const policy = deps.policy ?? (await loadReauthPolicy(deps.api));
  if (!requiresReauth(amountUsdc, policy)) return { ok: true, required: false };
  return reauthenticate(promptMessage, deps.auth);
}
