/* eslint-disable no-undef */
import {
  __resetUpdateSession,
  checkForUpdate,
  compareVersions,
  dismissUpdateForSession,
  isUpdateDismissed,
} from '../appUpdate.service';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

describe('appUpdate.service (issue #266)', () => {
  const URL = 'https://example.com/version.json';

  beforeEach(() => {
    __resetUpdateSession();
  });

  const mockManifest = (body: unknown, ok = true) => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValue({ ok, json: async () => body });
  };

  it('compares semantic versions', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.10.0')).toBeLessThan(0);
  });

  it('reports an update when a newer build is published', async () => {
    mockManifest({ latestVersion: '0.2.0', iosStoreUrl: 'ios', androidStoreUrl: 'android' });
    const info = await checkForUpdate('0.1.0', URL);
    expect(info?.latestVersion).toBe('0.2.0');
  });

  it('never reports an update for users on the latest build', async () => {
    mockManifest({ latestVersion: '0.1.0' });
    expect(await checkForUpdate('0.1.0', URL)).toBeNull();
  });

  it('returns null when the check is unconfigured or fails', async () => {
    mockManifest({}, false);
    expect(await checkForUpdate('0.1.0', URL)).toBeNull();
    expect(await checkForUpdate('0.1.0', undefined)).toBeNull();
  });

  it('remembers dismissal for the rest of the session', () => {
    expect(isUpdateDismissed()).toBe(false);
    dismissUpdateForSession();
    expect(isUpdateDismissed()).toBe(true);
  });
});
