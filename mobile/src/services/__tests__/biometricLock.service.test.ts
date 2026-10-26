import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_BIOMETRIC_LOCK_SETTINGS,
  authenticateWithBiometrics,
  getBiometricLockSettings,
  isBiometricAvailable,
  saveBiometricLockSettings,
  shouldLockOnResume,
} from '../biometricLock.service';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    __store: store,
  };
});

const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

const setBiometrics = (hasHardware: boolean, enrolled: boolean) => {
  LA.hasHardwareAsync.mockResolvedValue(hasHardware);
  LA.isEnrolledAsync.mockResolvedValue(enrolled);
};

describe('biometricLock.service (issue #258)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
  });

  it('is disabled by default', async () => {
    expect(await getBiometricLockSettings()).toEqual(DEFAULT_BIOMETRIC_LOCK_SETTINGS);
    expect(DEFAULT_BIOMETRIC_LOCK_SETTINGS.enabled).toBe(false);
  });

  it('persists settings', async () => {
    await saveBiometricLockSettings({ enabled: true, idleTimeoutMs: 300_000 });
    expect(await getBiometricLockSettings()).toEqual({ enabled: true, idleTimeoutMs: 300_000 });
  });

  it('ignores corrupt stored settings', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('{not json');
    expect(await getBiometricLockSettings()).toEqual(DEFAULT_BIOMETRIC_LOCK_SETTINGS);
  });

  describe('shouldLockOnResume', () => {
    const on = { enabled: true, idleTimeoutMs: 60_000 };

    it('never locks when the setting is disabled', () => {
      expect(shouldLockOnResume({ ...on, enabled: false }, 0, 10 * 60_000)).toBe(false);
    });

    it('does not lock before the idle timeout', () => {
      expect(shouldLockOnResume(on, 1_000, 30_000)).toBe(false);
    });

    it('locks once the idle timeout has elapsed', () => {
      expect(shouldLockOnResume(on, 1_000, 61_000)).toBe(true);
    });

    it('does not lock when the app was never backgrounded', () => {
      expect(shouldLockOnResume(on, null, 10 * 60_000)).toBe(false);
    });
  });

  it('reports availability only with hardware and an enrolment', async () => {
    setBiometrics(true, true);
    expect(await isBiometricAvailable()).toBe(true);
    setBiometrics(true, false);
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('falls back (passes) on devices without biometrics', async () => {
    setBiometrics(false, false);
    expect(await authenticateWithBiometrics()).toBe(true);
    expect(LA.authenticateAsync).not.toHaveBeenCalled();
  });

  it('requires a successful biometric prompt when available', async () => {
    setBiometrics(true, true);
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' } as never);
    expect(await authenticateWithBiometrics()).toBe(false);
    LA.authenticateAsync.mockResolvedValueOnce({ success: true } as never);
    expect(await authenticateWithBiometrics()).toBe(true);
  });
});
