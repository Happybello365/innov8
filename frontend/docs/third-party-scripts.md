# Third-party script inventory

Issue 507. Every third-party script the frontend loads at runtime must be listed here
with its purpose, owner and review cadence. A CI test
(`src/lib/__tests__/third-party-scripts.test.ts`) fails when a script host appears in
`src/` without an entry in this table.

Review cadence: re-confirm every entry each quarter, and whenever a `script-src`
change is proposed in `src/middleware.ts`.

## Runtime scripts

| Host | Loaded by | Purpose | Owner | Review cadence | Consent / PII |
| --- | --- | --- | --- | --- | --- |
| `plausible.io` (`/js/script.js`) | `src/lib/analytics.ts` (`AnalyticsTracker.initialize`), only when analytics is enabled with provider `plausible` and a domain is set | Privacy-friendly page-view analytics | Frontend maintainers | Quarterly | Event payloads are scrubbed of emails, IPs, wallet addresses and tokens before sending (see `scrubValue`). |

## Not loaded as scripts

These hosts are contacted but do not run third-party JavaScript in the page. They are listed
so reviewers do not mistake them for script sources.

| Host | Usage | Notes |
| --- | --- | --- |
| `gateway.pinata.cloud`, `ipfs.io` | IPFS evidence video playback (`<video src>`) | Media only. |
| `api.pinata.cloud` | Evidence upload from `VideoUploadCard` | Data only. |
| `horizon.stellar.org`, `stellar.expert` | Read-only links and API calls | Data and links only. |
| `www.freighter.app` | Wallet install link | Link only. The Freighter extension injects its own API, which is not loaded by this app. |

## Fonts

Fonts come from `next/font/google` (Geist, Geist Mono, Manrope). Next.js downloads them at build time
and serves them from the app origin, so no runtime font host is needed.

## Adding a script

1. Add a row to the runtime table with an owner and review cadence.
2. Add the host to the `script-src` policy in `src/middleware.ts` only if the browser needs it. Note that
   the current policy allows `https:` scripts, so enforcement should be tightened in the same change.
3. Get security sign-off, as required for CSP changes.
