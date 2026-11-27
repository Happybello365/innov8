import { Platform } from 'react-native';
import { checkForUpdate } from '../appUpdate.service';

const URL = 'https://example.test/manifest.json';

function mockFetchJson(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('appUpdate manifest guard (issue #527)', () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOs, configurable: true });
    jest.restoreAllMocks();
  });

  it('ignores a manifest that omits latestVersion', async () => {
    mockFetchJson({ iosStoreUrl: 'https://apps.example/ios' });

    expect(await checkForUpdate('0.1.0', URL)).toBeNull();
  });

  it('ignores a non-OK manifest response even if the body looks valid', async () => {
    mockFetchJson({ latestVersion: '9.9.9' }, false);

    expect(await checkForUpdate('0.1.0', URL)).toBeNull();
  });

  it('uses the Android store URL on Android and the iOS URL on iOS', async () => {
    const body = {
      latestVersion: '0.2.0',
      iosStoreUrl: 'https://apps.example/ios',
      androidStoreUrl: 'https://apps.example/android',
    };

    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    mockFetchJson(body);
    expect((await checkForUpdate('0.1.0', URL))?.storeUrl).toBe('https://apps.example/android');

    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockFetchJson(body);
    expect((await checkForUpdate('0.1.0', URL))?.storeUrl).toBe('https://apps.example/ios');
  });
});
