import * as LocalAuthentication from 'expo-local-authentication';
import { authenticateWithBiometrics } from '../biometricLock.service';

/**
 * Unlock-attempt UX for the biometric lock (issue #516).
 *
 * The app has no PIN lockout. The equivalent user-facing unlock flow is the
 * biometric prompt shown on resume, so these tests cover its failure, retry,
 * and error-containment paths without exposing any device-level detail.
 */

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

describe('biometric unlock attempts (issue #516)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LA.hasHardwareAsync.mockResolvedValue(true);
    LA.isEnrolledAsync.mockResolvedValue(true);
  });

  it('returns false without throwing when the user cancels the prompt', async () => {
    LA.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' } as never);

    await expect(authenticateWithBiometrics()).resolves.toBe(false);
  });

  it('returns false without throwing when the prompt itself fails (e.g. system lockout)', async () => {
    LA.authenticateAsync.mockRejectedValue(new Error('biometric_lockout: too many attempts'));

    await expect(authenticateWithBiometrics()).resolves.toBe(false);
  });

  it('re-prompts on every attempt after a failure and unlocks once verified', async () => {
    LA.authenticateAsync
      .mockResolvedValueOnce({ success: false, error: 'authentication_failed' } as never)
      .mockResolvedValueOnce({ success: false, error: 'authentication_failed' } as never)
      .mockResolvedValueOnce({ success: true } as never);

    expect(await authenticateWithBiometrics()).toBe(false);
    expect(await authenticateWithBiometrics()).toBe(false);
    expect(await authenticateWithBiometrics()).toBe(true);
    expect(LA.authenticateAsync).toHaveBeenCalledTimes(3);
  });

  it('shows the same user-facing prompt copy on every attempt', async () => {
    LA.authenticateAsync.mockResolvedValue({ success: false } as never);

    await authenticateWithBiometrics();
    await authenticateWithBiometrics();

    for (const [options] of LA.authenticateAsync.mock.calls) {
      expect(options).toEqual({ promptMessage: 'Unlock Amana', cancelLabel: 'Cancel' });
    }
  });

  it('does not leak the raw device error to the caller', async () => {
    LA.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'secret-device-detail',
    } as never);

    const result = await authenticateWithBiometrics();

    expect(typeof result).toBe('boolean');
    expect(JSON.stringify(result)).not.toContain('secret-device-detail');
  });
});
