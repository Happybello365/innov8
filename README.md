# innov8

Agricultural escrow platform.

## Local full-stack development guide

This guide provides one reproducible setup for the frontend, backend, mobile app, contracts, Supabase, and tracing. Run the steps in order from a fresh clone.

### Prerequisites

- Node.js 20 LTS and npm 10
- Docker Desktop (for Supabase local stack)
- Rust toolchain with `wasm32-unknown-unknown` target (contracts)
- Expo CLI (`npx expo`) for the mobile app

### 1. Environment configuration

Copy the example env files and fill in local-only values. Never commit real secrets.

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Key local defaults (override in your `.env` files):

| Variable | Purpose | Local default |
| --- | --- | --- |
| `DATABASE_URL` | Backend Postgres connection | `postgresql://postgres:postgres@localhost:54322/postgres` |
| `SUPABASE_URL` | Supabase API endpoint | `http://localhost:54321` |
| `SUPABASE_ANON_KEY` | Public anon key (local only) | printed by `supabase start` |
| `API_PORT` | Backend HTTP port | `3001` |
| `WEB_PORT` | Frontend dev server port | `3000` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Tracing collector | `http://localhost:4318` |

### 2. Supabase

```bash
supabase start
supabase db reset   # applies migrations and seed data
```

`supabase start` prints the local anon/service keys; copy them into your `.env` files. Do not reuse production keys locally.

### 3. Backend

```bash
npm install
npm run --workspace apps/api dev
```

The API listens on `API_PORT` (default `3001`) and exposes a health check at `GET /health`.

### 4. Frontend

```bash
npm run --workspace apps/web dev
```

The web app runs on `WEB_PORT` (default `3000`) and reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` from `apps/web/.env`.

### 5. Mobile

```bash
npm run --workspace apps/mobile start
```

Point the mobile app at your machine's LAN IP (not `localhost`) so a physical device can reach the backend and Supabase.

### 6. Contracts

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cargo test
```

Deploy to the local network only after tests pass; never deploy with production keys from a local shell.

### 7. Tracing

Run an OTLP-compatible collector (for example the Jaeger all-in-one container) and set `OTEL_EXPORTER_OTLP_ENDPOINT` to its HTTP endpoint. If the collector is unreachable, services log a warning and continue serving traffic; tracing is best-effort and must never block requests.

### Required CI gates

- **Frontend Required Gate**: `npm ci`, `npm run lint`, `npm run build`, `npm test` in `frontend/`
- **Backend Required Gate**: `npm ci`, `npm run build`, `npm test` in `backend/`
- **Mobile Required Gate**: `npm ci`, `npm run type-check`, `npm run lint` in `mobile/`
- **Contracts Required Gate**: `cargo test` in `contracts/amana_escrow/`

### Troubleshooting

- **Port already in use**: change `API_PORT`/`WEB_PORT` in your `.env` and restart the affected service.
- **Supabase keys missing**: re-run `supabase status` to print local keys.
- **Mobile cannot reach backend**: use the host LAN IP and confirm the firewall allows the API port.
- **Tracing warnings**: verify the collector is running at `OTEL_EXPORTER_OTLP_ENDPOINT`; absence of tracing does not affect functionality.

## Architecture ownership map

Each area of the platform has a named owner role and an escalation path. The canonical, up-to-date map lives in [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md); this section is a summary so the map is discoverable from the main workflow.

| Area | Primary owner role | Backup | Escalation |
| --- | --- | --- | --- |
| Backend (`apps/api`) | Backend lead | Backend on-call | Security lead, then platform on-call |
| Frontend (`apps/web`) | Frontend lead | Frontend on-call | Security lead, then platform on-call |
| Mobile (`apps/mobile`) | Mobile lead | Mobile on-call | Security lead, then platform on-call |
| Smart contracts | Contracts lead | Contracts reviewer | Security lead, then platform on-call |

Escalation tiers:

1. **Primary owner** — first responder for changes, reviews, and incidents in the area.
2. **Backup / secondary** — takes over when the primary is unavailable.
3. **Security / on-call** — escalate security-sensitive issues (key handling, authorization, contract upgrades) to the security lead, and production incidents to the platform on-call.

Contact owners through the team's existing channels (issue tracker, team chat, and on-call rotation). Do not embed personal contact details, secrets, or PII in this repository; keep rosters in the private team directory and reference roles here.

To update the map, edit `docs/OWNERSHIP.md` and keep this summary table in sync. Ownership changes should be reviewed like any other documentation change.

## Release notes generation guide

Release notes are generated automatically from **reviewed and merged** pull requests. This section defines the changelog categories, how PR labels map to them, and which PRs are included or excluded so contributors can predict what ships in each release.

### Changelog categories

Every release note entry is grouped under one of the following categories, in this order:

| Category | Meaning | Typical PR label |
| --- | --- | --- |
| **Added** | New features or capabilities | `feature`, `enhancement` |
| **Changed** | Changes to existing behavior | `change`, `refactor` |
| **Fixed** | Bug fixes | `bug`, `fix` |
| **Security** | Security-relevant fixes or hardening | `security` |
| **Deprecated** | Features slated for removal | `deprecation` |
| **Removed** | Features or APIs removed | `removal` |

A PR is placed in the category matching its label. If a PR carries multiple category labels, it appears under each matching category. PRs without a recognized category label are grouped under **Changed** so nothing merged is silently dropped.

### Inclusion and exclusion rules

Included:

- Pull requests that are **merged** into the release branch and have passed review.
- PRs with a recognized category label (see table above).

Excluded:

- Open, draft, or closed-but-unmerged PRs.
- PRs labeled `skip-changelog` (for example, internal chores or CI-only changes).
- Automated dependency bumps labeled `dependencies` unless they also carry a category label.

### Automation workflow

1. Contributors label their PR with exactly one category label from the table above (plus `skip-changelog` when the change should not appear in release notes).
2. On merge to the release branch, the release automation collects merged PRs since the previous release tag.
3. Each PR is mapped to its category and rendered as a bullet with the PR title and number.
4. The generated notes are attached to the release draft for maintainer review before publishing.

### Configuration

- **Category labels**: the label names in the table above are the source of truth; renaming a label requires updating this guide and the release automation config together.
- **Exclusion label**: `skip-changelog` removes a merged PR from generated notes.
- **Release branch**: notes are generated from merges into the release branch; PRs merged only to feature branches are not included until they reach the release branch.

Keep this guide in sync with the release automation configuration whenever labels or inclusion rules change.

## Mobile network state action guards

The mobile app must not silently fail or queue unsupported work while the device is offline.

- Network-dependent actions (submitting escrow transactions, syncing, uploading evidence) are **disabled** while offline and surface an inline explanation to the user.
- Only actions explicitly marked as offline-queueable are queued; all other actions are blocked with a clear message until connectivity returns.
- When connectivity is restored, queued work is flushed and any failures are reported without leaking secrets or PII.

## 📐 Architecture Decision Records

Key architectural decisions are documented as ADRs in [`docs/adr/`](./docs/adr):

- [ADR-001: Stellar Path Payment Architecture](./docs/adr/ADR-001-stellar-path-payment-architecture.md)
- [ADR-002: Escrow Loss-Sharing Model](./docs/adr/ADR-002-escrow-loss-sharing-model.md)
- [ADR-003: Off-chain vs. On-chain Data Partitioning](./docs/adr/ADR-003-offchain-vs-onchain-data-partitioning.md)
- [ADR-004: Idempotency and Retry Strategy](./docs/adr/ADR-004-idempotency-and-retry-strategy.md)
- [ADR-005: Frontend State Management](./docs/adr/ADR-005-frontend-state-management.md)

## 🔐 Security & Operations

- [Security Policy](./SECURITY.md) — privately report vulnerabilities through GitHub's private vulnerability reporting.
- [Threat Model](./docs/threat-model.md) — reviewed quarterly and on trigger events; see §8 for cadence/ownership and `docs/threat-model-review-checklist.md` for the reviewer checklist.
- [Secrets Policy & Rotation](./docs/secrets-policy.md) — secrets inventory (owner, location, max-age), rotation automation, and verification. Rotation reminders

### Security Disclosure Triage SLA

Vulnerability reports are handled under the timelines below. All times are measured from the moment a report is received through GitHub's private vulnerability reporting channel described in [SECURITY.md](./SECURITY.md). Reports are triaged by the security maintainers on rotation; the reporter is kept informed at each stage.

#### Severity tiers and SLA targets

| Tier | Definition (examples) | Acknowledgement | Initial response / triage | Remediation target | Public disclosure |
| --- | --- | --- | --- | --- | --- |
| **Critical** | Loss of escrowed funds, contract authorization bypass, private key or secret exposure | ≤ 24 hours | ≤ 48 hours | ≤ 7 days | Coordinated, ≤ 7 days after fix ships |
| **High** | Privilege escalation, replay of settlement/webhook events, PII exposure | ≤ 48 hours | ≤ 3 business days | ≤ 14 days | Coordinated, ≤ 14 days after fix ships |
| **Medium** | Denial of service, information disclosure without PII, misconfiguration | ≤ 3 business days | ≤ 5 business days | ≤ 30 days | Coordinated, ≤ 30 days after fix ships |
| **Low** | Hardening, defense-in-depth, documentation gaps | ≤ 5 business days | ≤ 10 business days | Next scheduled release | Coordinated with the reporter |

- **Acknowledgement** confirms receipt and assigns a tracking ID; it does not imply a confirmed severity.
- **Initial response / triage** includes a severity assessment, affected components, and a remediation plan.
- **Remediation target** is the goal for a fix merged to `main`; complex fixes may be re-scoped with the reporter and documented in the advisory.
- **Public disclosure** is coordinated with the reporter and published as a GitHub Security Advisory once a fix is available. Reporters may request earlier disclosure; we will not publish before a fix or mitigation is available unless the reporter and maintainers agree.

#### Edge cases and failure states

- **Disputed severity:** If the reporter and maintainers disagree on severity, the higher tier's acknowledgement and response targets apply until consensus is reached. The rationale is recorded in the advisory.
- **Incomplete reports:** Reports missing reproduction steps or affected versions are acknowledged within the tier target and the reporter is asked for the missing details. The triage clock pauses while awaiting the reporter; if no response is received within 14 days, the report is closed as `needs-info` and may be reopened.
- **Third-party dependencies:** Issues in upstream dependencies (Stellar/Soroban, Next.js, Supabase, Pinata, etc.) are triaged by us, then reported upstream. Our remediation target covers applying the upstream fix or a documented mitigation; disclosure follows the upstream advisory timeline.
- **Actively exploited issues:** Any report indicating active exploitation is escalated to Critical regardless of initial tier, and mitigation is prioritized over the standard remediation target.
- **No PII or secrets in reports:** Do not include private keys, credentials, or personal data in reports or advisories. Redact sensitive values and share them only through the private reporting channel.

#### Tracking and verification

- Each report is tracked as a private security advisory with the assigned tier and due dates.
- SLA adherence is reviewed at each security maintainer rotation handoff; breaches are recorded with a root-cause note.
- Fixes ship with regression tests covering the reported failure path before the advisory is published.

See the mobile stack documentation for the list of supported offline-queueable actions.
