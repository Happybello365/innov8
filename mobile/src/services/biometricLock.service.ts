import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * Optional biometric lock on app resume (issue #258).
 *
 * Off by default. When enabled, returning to the app after it has been in the
 * background for longer than `idleTimeoutMs` requires Face ID / Touch ID /
 * device biometric confirmation. Devices without enrolled biometrics are never
 * locked out: they fall back to the existing wallet-token auth flow.
 */

const SETTINGS_KEY = 'amana_biometric_lock';

export interface BiometricLockSettings {
  enabled: boolean;
  idleTimeoutMs: number;
}

export const IDLE_TIMEOUT_OPTIONS_MS = [0, 30_000, 60_000, 5 * 60_000, 15 * 60_000] as const;

export const DEFAULT_BIOMETRIC_LOCK_SETTINGS: BiometricLockSettings = {
  enabled: false,
  idleTimeoutMs: 60_000,
};

export async function getBiometricLockSettings(): Promise<BiometricLockSettings> {
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (!raw) return DEFAULT_BIOMETRIC_LOCK_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BiometricLockSettings>;
    return {
      enabled: parsed.enabled === true,
      idleTimeoutMs:
        typeof parsed.idleTimeoutMs === 'number' && parsed.idleTimeoutMs >= 0
          ? parsed.idleTimeoutMs
          : DEFAULT_BIOMETRIC_LOCK_SETTINGS.idleTimeoutMs,
    };
  } catch {
    return DEFAULT_BIOMETRIC_LOCK_SETTINGS;
  }
}

export async function saveBiometricLockSettings(settings: BiometricLockSettings): Promise<void> {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
}

/** True when the device has biometric hardware with at least one enrolment. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export function shouldLockOnResume(
  settings: BiometricLockSettings,
  backgroundedAt: number | null,
  now: number,
): boolean {
  if (!settings.enabled || backgroundedAt === null) return false;
  return now - backgroundedAt >= settings.idleTimeoutMs;
}

/**
 * Prompt for biometric confirmation. Resolves true when the user is verified,
 * or when the device cannot do biometrics (fallback to the existing auth flow).
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  if (!(await isBiometricAvailable())) return true;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Amana',
      cancelLabel: 'Cancel',
    });
    return result.success;
  } catch {
    return false;
  }
}
