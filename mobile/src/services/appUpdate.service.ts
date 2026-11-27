/* global AbortController */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * In-app update prompt (issue #266).
 *
 * `EXPO_PUBLIC_UPDATE_CHECK_URL` points at a small JSON manifest:
 *
 *   { "latestVersion": "0.2.0", "iosStoreUrl": "...", "androidStoreUrl": "..." }
 *
 * When unset, update checks are disabled and the banner never shows.
 */

export interface UpdateInfo {
  latestVersion: string;
  minimumVersion?: string;
  storeUrl?: string;
  required?: boolean;
}

const VERSION = /^\d{1,8}(?:\.\d{1,8}){1,2}$/;
const STORE_URLS: Record<string, RegExp> = {
  ios: /^(?:https|itms-apps):\/\/apps\.apple\.com\/[^\s\\]+$/i,
  android: /^(?:https:\/\/play\.google\.com\/store\/apps\/details|market:\/\/details)\?[^\s\\]+$/i,
};

/** Returns <0 if a < b, 0 if equal, >0 if a > b. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function getCurrentVersion(): string | undefined {
  return Constants.expoConfig?.version;
}

/** A null result means the update policy could not be loaded. */
export async function loadUpdatePolicy(
  currentVersion: string | undefined = getCurrentVersion(),
  url: string | undefined = process.env.EXPO_PUBLIC_UPDATE_CHECK_URL,
): Promise<UpdateInfo | null> {
  if (!url || !currentVersion || !VERSION.test(currentVersion)) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function request(): Promise<UpdateInfo | null> {
    const res = await fetch(url!, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || typeof body.latestVersion !== 'string' || !VERSION.test(body.latestVersion)) {
      return null;
    }
    const minimumVersion: unknown = body.minimumVersion;
    if (minimumVersion !== undefined && (
      typeof minimumVersion !== 'string' ||
      !VERSION.test(minimumVersion) ||
      compareVersions(minimumVersion, body.latestVersion) > 0
    )) return null;

    const store = Platform.OS === 'ios' ? body.iosStoreUrl : body.androidStoreUrl;
    return {
      latestVersion: body.latestVersion,
      minimumVersion,
      storeUrl: typeof store === 'string' && STORE_URLS[Platform.OS]?.test(store) ? store : undefined,
      required: minimumVersion !== undefined && compareVersions(currentVersion!, minimumVersion) < 0,
    };
  }

  try {
    return await Promise.race([request(), new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 5000);
    })]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Preserve the optional banner's API for callers that only want newer versions. */
export async function checkForUpdate(
  currentVersion: string | undefined = getCurrentVersion(),
  url: string | undefined = process.env.EXPO_PUBLIC_UPDATE_CHECK_URL,
): Promise<UpdateInfo | null> {
  const policy = await loadUpdatePolicy(currentVersion, url);
  return policy && currentVersion && compareVersions(currentVersion, policy.latestVersion) < 0
    ? policy
    : null;
}

// Module-level so dismissal survives screen remounts but resets on cold start
// ("at most once per session").
let dismissedThisSession = false;

export function isUpdateDismissed(): boolean {
  return dismissedThisSession;
}

export function dismissUpdateForSession(): void {
  dismissedThisSession = true;
}

/** Test-only helper. */
export function __resetUpdateSession(): void {
  dismissedThisSession = false;
}
