# Deep Linking

Issue: #261 · Related: #83 (push), #85 (screens)

A notification tap or a shared web URL lands the user on the **exact trade**,
cold- or warm-started, on both platforms.

## URL scheme + hosts

| | value |
| --- | --- |
| Custom scheme | `amanavault://` |
| Universal / App Links | `https://amanavault.app`, `https://www.amanavault.app` |

Config source of truth: `src/constants/links.ts` (path table), consumed by
`app.config.ts` (iOS `associatedDomains`, Android `intentFilters` w/ `autoVerify`)
and `navigation/AppNavigator.tsx`.

## Path map (web ⇄ app)

| Web path | Screen | Params |
| --- | --- | --- |
| `/trades/:tradeId` | `TradeDetail` | `{ tradeId }` |
| `/disputes/:id` | `DisputeDetail` | `{ id }` |
| `/trades/:tradeId/evidence` | `EvidenceCapture` | `{ tradeId }` |
| `/trades` | `TradeList` | — |
| `/create-trade` | `CreateTrade` | — |

`frontend/src/lib/links.ts` mirrors this table for the web side.

## Auth-aware guards (login-then-continue)

1. `parseDeepLink(url)` → target, or `null` for unknown/malformed (dropped
   silently — never crashes).
2. `AppNavigator.getStateFromPath` sends an unauthenticated user hitting a
   protected link to `WalletConnect`.
3. `useDeepLink` parks the real target in a module-level slot (survives the
   WalletConnect → TradeList remount) and `resumePendingDeepLink` replays it the
   moment a token appears.

## Allowlist validation (issue #534)

Every incoming URL passes `deepLinkRejectionReason()` / `isAllowedDeepLink()`
(`src/constants/links.ts`) **before** it is matched against the path table, so
links to unrelated resources never navigate and are never parked for login.

| Rule | Accepted | Rejected (reason) |
| --- | --- | --- |
| Scheme | `amanavault:`, `https:` | `http:`, `javascript:`, `file:`, `intent:`, other apps (`scheme`) |
| Host (`https:` only) | `ALLOWED_LINK_HOSTS` = `amanavault.app`, `www.amanavault.app` (case-insensitive, exact match) | look-alikes such as `amanavault.app.evil.example` (`host`) |
| Authority | bare host | userinfo `user:pass@` (`credentials`), explicit port (`port`), protocol-relative `//host` (`host`) |
| Characters | printable URL characters | whitespace, control characters, backslashes (`malformed`) |
| Route params | one decoded path segment, ≤ 128 chars | encoded `/` `\` `?` `#`, `..`, bad percent-encoding |

Bare paths (`/trades/T-1`) remain valid: they are produced internally by
notification routing and by react-navigation after prefix stripping.
`LINK_PREFIXES` is derived from `ALLOWED_LINK_HOSTS`; when adding a host, update
`ALLOWED_LINK_HOSTS`, `LINK_HOSTS` in `app.config.ts`, and the hosted
association files together. Rejected links are dropped silently; the reason
code is never logged with the raw URL, so tokens or PII in a crafted link are
not leaked.

## Cold vs warm start

- **Cold**: `Linking.getInitialURL()` in `AppNavigator` on mount.
- **Warm**: `Linking.addEventListener('url', …)`.
Both funnel through `useDeepLink().handleUrl`. Covered by
`hooks/useDeepLink.test.ts` and `constants/__tests__/links.test.ts`.

## Fallback for recipients without the app

The web app is the fallback view: `/trades/[id]` renders the trade for anyone,
and the hosted association files let a future visit open the app instead once
installed. Verify the association files are live:

```
curl -s https://amanavault.app/.well-known/apple-app-site-association | jq .
curl -s https://amanavault.app/.well-known/assetlinks.json | jq .
```

Both are served as `application/json` via `frontend/next.config.ts` `headers()`.
Before release, replace `TEAMID` in the AASA file with the Apple Team ID and the
Android `sha256_cert_fingerprints` placeholder with the release signing cert.
