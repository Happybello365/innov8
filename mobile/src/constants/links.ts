import type { RootStackParamList } from '../types/navigation';

/**
 * Shared deep-link constants (issue #261).
 *
 * One place that maps a canonical path (`/trades/:id`) to a navigator screen
 * and back to a public web URL. The web app mirrors this in
 * `frontend/src/lib/links.ts` — keep the two in sync (the path table below is
 * the contract).
 */

export const APP_SCHEME = 'amanavault';
export const WEB_ORIGIN = 'https://amanavault.app';

/**
 * Universal / App Link hosts we accept (issue #534). Must match
 * `LINK_HOSTS` in app.config.ts and the hosted association files.
 */
export const ALLOWED_LINK_HOSTS: readonly string[] = ['amanavault.app', 'www.amanavault.app'];

/** Only these URL schemes may open a screen. `http:` is deliberately excluded. */
export const ALLOWED_LINK_SCHEMES: readonly string[] = [`${APP_SCHEME}:`, 'https:'];

/** Hosts we accept universal / app links from. */
export const LINK_PREFIXES = [`${APP_SCHEME}://`, ...ALLOWED_LINK_HOSTS.map((h) => `https://${h}`)];

/**
 * Route params (trade / dispute ids) must be a single path segment once
 * decoded. Encoded path separators (`%2F`, `%5C`), query / fragment markers,
 * control characters and traversal sequences are rejected so a crafted link
 * can't smuggle another resource into a screen. Max 128 chars.
 */
// eslint-disable-next-line no-control-regex
const SAFE_PARAM = /^[^/\\?#\u0000-\u001f\u007f]{1,128}$/;

export type DeepLinkRejectionReason =
  | 'empty'
  | 'malformed'
  | 'scheme'
  | 'host'
  | 'credentials'
  | 'port';

/**
 * Validate a raw URL against the deep-link allowlist (issue #534).
 *
 * Bare paths (`/trades/123`, produced internally e.g. by notification routing)
 * are allowed; absolute URLs must use an allowed scheme and, for `https:`, an
 * allowed host with no userinfo and no explicit port. Returns the reason for
 * rejection, or `null` when the URL is acceptable.
 */
export function deepLinkRejectionReason(input: string | null | undefined): DeepLinkRejectionReason | null {
  if (!input || typeof input !== 'string' || !input.trim()) return 'empty';
  // Control characters / whitespace inside a link are never legitimate.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(input)) return 'malformed';

  const schemeMatch = input.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (!schemeMatch) {
    // Bare path. Protocol-relative URLs (`//evil.example/...`) are not paths.
    return input.startsWith('//') ? 'host' : null;
  }

  const scheme = `${schemeMatch[1].toLowerCase()}:`;
  if (!ALLOWED_LINK_SCHEMES.includes(scheme)) return 'scheme';

  // Parse the authority by hand rather than via `URL`: React Native's URL
  // polyfill does not implement every getter, and we only need the authority.
  const rest = input.slice(schemeMatch[0].length);
  if (!rest.startsWith('//')) return 'malformed';
  const authority = rest.slice(2).split(/[/?#]/, 1)[0];
  if (authority.includes('@')) return 'credentials';
  if (authority.includes(':')) return 'port';
  if (scheme === 'https:') {
    if (!ALLOWED_LINK_HOSTS.includes(authority.toLowerCase())) return 'host';
  }
  return null;
}

/** True when `input` passes the deep-link allowlist. */
export function isAllowedDeepLink(input: string | null | undefined): boolean {
  return deepLinkRejectionReason(input) === null;
}

export interface DeepLinkTarget {
  screen: keyof RootStackParamList;
  params?: Record<string, string>;
}

/** Screens reachable without authentication. Everything else defers to login. */
export const PUBLIC_SCREENS: ReadonlySet<keyof RootStackParamList> = new Set(['WalletConnect']);

interface Route {
  /** react-navigation linking `path` (relative, no leading slash). */
  path: string;
  screen: keyof RootStackParamList;
  match: RegExp;
  toParams: (m: RegExpMatchArray) => Record<string, string>;
  toWebPath: (params: Record<string, string>) => string;
}

const ROUTES: Route[] = [
  {
    path: 'create-trade',
    screen: 'CreateTrade',
    match: /^\/?(?:create-trade|trades\/create)\/?$/,
    toParams: () => ({}),
    toWebPath: () => `/trades/create`,
  },
  {
    path: 'connect',
    screen: 'WalletConnect',
    match: /^\/?connect\/?$/,
    toParams: () => ({}),
    toWebPath: () => '/connect',
  },
  {
    path: 'vault',
    screen: 'VaultDashboard',
    match: /^\/?vault\/?$/,
    toParams: () => ({}),
    toWebPath: () => '/vault',
  },
  {
    path: 'trades/:tradeId',
    screen: 'TradeDetail',
    match: /^\/?trades\/([^/?#]+)\/?$/,
    toParams: (m) => ({ tradeId: decodeURIComponent(m[1]) }),
    toWebPath: (p) => `/trades/${encodeURIComponent(p.tradeId)}`,
  },
  {
    path: 'disputes/:id',
    screen: 'DisputeDetail',
    match: /^\/?disputes\/([^/?#]+)\/?$/,
    toParams: (m) => ({ id: decodeURIComponent(m[1]) }),
    toWebPath: (p) => `/disputes/${encodeURIComponent(p.id)}`,
  },
  {
    path: 'trades/:tradeId/evidence',
    screen: 'EvidenceCapture',
    match: /^\/?(?:trades\/([^/?#]+)\/evidence|evidence\/([^/?#]+))\/?$/,
    toParams: (m) => ({ tradeId: decodeURIComponent(m[1] ?? m[2]) }),
    toWebPath: (p) => `/trades/${encodeURIComponent(p.tradeId)}/evidence`,
  },
  {
    path: 'trades',
    screen: 'TradeList',
    match: /^\/?trades\/?$/,
    toParams: () => ({}),
    toWebPath: () => `/trades`,
  },

];

/** react-navigation `linking.config.screens` map. */
export const LINKING_SCREEN_CONFIG: Partial<Record<keyof RootStackParamList, string>> = ROUTES.reduce(
  (acc, r) => ({ ...acc, [r.screen]: r.path }),
  { WalletConnect: 'connect', VaultDashboard: 'vault' },
);

/**
 * Parse an incoming URL or bare path into a navigation target.
 * Returns `null` for anything unrecognised or malformed — callers must handle
 * that gracefully (see AppNavigator / useDeepLink).
 */
export function parseDeepLink(input: string | null | undefined): DeepLinkTarget | null {
  if (!input || typeof input !== 'string') return null;

  // Allowlist first (issue #534): unrelated schemes / hosts never route.
  if (!isAllowedDeepLink(input)) return null;

  const absolute = input.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/);
  let pathname = input;
  if (absolute) {
    const [, scheme, authority, path] = absolute;
    pathname = scheme.toLowerCase() === APP_SCHEME && authority ? `/${authority}${path}` : path;
  }

  for (const route of ROUTES) {
    const m = pathname.match(route.match);
    if (m) {
      let params: Record<string, string>;
      try {
        params = route.toParams(m);
      } catch {
        return null; // malformed percent-encoding
      }
      // reject empty / obviously bad / unsafe ids
      if (
        Object.values(params).some(
          (v) => v === '' || v === 'undefined' || v === 'null' || !SAFE_PARAM.test(v) || v.includes('..'),
        )
      ) {
        return null;
      }
      return { screen: route.screen, params: Object.keys(params).length ? params : undefined };
    }
  }
  return null;
}

/** Map a navigation target to the public web URL (for "share" / fallback). */
export function webUrlFor(target: DeepLinkTarget): string {
  const route = ROUTES.find((r) => r.screen === target.screen);
  if (!route) return WEB_ORIGIN;
  return `${WEB_ORIGIN}${route.toWebPath(target.params ?? {})}`;
}

export function requiresAuth(target: DeepLinkTarget): boolean {
  return !PUBLIC_SCREENS.has(target.screen);
}
