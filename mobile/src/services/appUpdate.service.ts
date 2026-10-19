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
  storeUrl?: string;
}

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

/**
 * Resolves to update info when a newer build is published, otherwise null.
 * Network / parse failures resolve to null — a missed prompt is harmless.
 */
export async function checkForUpdate(
  currentVersion: string | undefined = getCurrentVersion(),
  url: string | undefined = process.env.EXPO_PUBLIC_UPDATE_CHECK_URL,
): Promise<UpdateInfo | null> {
  if (!url || !currentVersion) return null;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      latestVersion?: string;
      iosStoreUrl?: string;
      androidStoreUrl?: string;
    };
    if (!body.latestVersion || compareVersions(body.latestVersion, currentVersion) <= 0) {
      return null;
    }
    return {
      latestVersion: body.latestVersion,
      storeUrl: Platform.OS === 'ios' ? body.iosStoreUrl : body.androidStoreUrl,
    };
  } catch {
    return null;
  }
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
