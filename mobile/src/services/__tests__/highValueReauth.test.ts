import * as LocalAuthentication from 'expo-local-authentication';
import {
  DEFAULT_HIGH_VALUE_THRESHOLD_USDC,
  guardHighValueAction,
  loadReauthPolicy,
  policyFromFlag,
  requiresReauth,
  toStroops,
  type ReauthPolicy,
} from '../highValueReauth';

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

jest.mock('../../api/features', () => ({ featuresApi: { getFlag: jest.fn() } }));

const auth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const policy: ReauthPolicy = { enabled: true, thresholdUsdc: 5000, source: 'flag' };

beforeEach(() => {
  jest.clearAllMocks();
  auth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
});

describe('requiresReauth (#269)', () => {
  it('requires re-auth strictly above the threshold', () => {
    expect(requiresReauth('5000.0000001', policy)).toBe(true);
    expect(requiresReauth('5000', policy)).toBe(false);
    expect(requiresReauth('4999.99', policy)).toBe(false);
  });

  it('treats malformed amounts as high value (fail closed)', () => {
    expect(requiresReauth('abc', policy)).toBe(true);
    expect(requiresReauth('-1', policy)).toBe(true);
  });

  it('never requires re-auth when the flag is disabled', () => {
    expect(requiresReauth('1000000', { ...policy, enabled: false })).toBe(false);
  });

  it('parses decimal strings exactly', () => {
    expect(toStroops('1.5')).toBe(15_000_000n);
    expect(toStroops('0.00000001')).toBe(0n);
    expect(toStroops('1e3')).toBeNull();
  });
});

describe('policy resolution (#269)', () => {
  it('uses the flag value as the USDC threshold', () => {
    expect(policyFromFlag({ name: 'x', enabled: true, value: 250 })).toEqual({ enabled: true, thresholdUsdc: 250, source: 'flag' });
  });

  it('falls back to the default threshold when the flag has no value', () => {
    expect(policyFromFlag({ name: 'x', enabled: true, value: null }).thresholdUsdc).toBe(DEFAULT_HIGH_VALUE_THRESHOLD_USDC);
  });

  it('fails safe (enabled, default threshold) when the flag cannot be loaded', async () => {
    const api = { getFlag: jest.fn().mockRejectedValue(new Error('offline')) };
    await expect(loadReauthPolicy(api)).resolves.toEqual({
      enabled: true,
      thresholdUsdc: DEFAULT_HIGH_VALUE_THRESHOLD_USDC,
      source: 'default',
    });
  });
});

describe('guardHighValueAction (#269)', () => {
  it('lets trades at or below the threshold through without prompting', async () => {
    await expect(guardHighValueAction('100', 'p', { policy, auth })).resolves.toEqual({ ok: true, required: false });
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('allows a high-value confirmation after successful re-auth, with passcode fallback', async () => {
    auth.authenticateAsync.mockResolvedValue({ success: true });
    await expect(guardHighValueAction('9000', 'Confirm', { policy, auth })).resolves.toEqual({ ok: true, required: true });
    expect(auth.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }));
  });

  it('blocks a high-value confirmation when re-auth fails', async () => {
    auth.authenticateAsync.mockResolvedValue({ success: false, error: 'authentication_failed' } as never);
    await expect(guardHighValueAction('9000', 'Confirm', { policy, auth })).resolves.toMatchObject({ ok: false, reason: 'failed' });
  });

  it('blocks when the user cancels the prompt', async () => {
    auth.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' } as never);
    await expect(guardHighValueAction('9000', 'Confirm', { policy, auth })).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
  });

  it('blocks when the device has no biometrics or passcode', async () => {
    auth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await expect(guardHighValueAction('9000', 'Confirm', { policy, auth })).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('blocks when the auth module throws', async () => {
    auth.authenticateAsync.mockRejectedValue(new Error('native crash'));
    await expect(guardHighValueAction('9000', 'Confirm', { policy, auth })).resolves.toMatchObject({ ok: false });
  });
});
