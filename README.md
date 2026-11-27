# innov8

# innov8

Agricultural escrow platform connecting smallholder farmers, buyers, and financiers through transparent, milestone-based settlement.

## Repository layout

- `backend/` — API service (Node.js/TypeScript)
- `.github/workflows/` — CI and deployment pipelines

## Setup

See `backend/README.md` for backend setup instructions.

## Container image promotion

Deployment pipelines promote **immutable image digests** (`sha256:...`) between
environments instead of mutable tags. Tags such as `latest` or `staging` are
convenience labels only and are never used to select what runs in an
environment.

### How it works

1. The build job publishes the image and records its digest
   (`docker buildx imagetools inspect` / `docker inspect --format '{{index .RepoDigests 0}}'`).
2. The digest is passed to downstream environments as a workflow input
   (`image_digest`), not a tag.
3. Each environment pulls by digest, e.g.
   `ghcr.io/<org>/innov8-backend@sha256:<digest>`.

### Configuration

- `IMAGE_DIGEST` — the `sha256:...` digest to deploy. Required for staging and
  production deploys; the workflow fails fast if it is missing or malformed.
- `IMAGE_REPOSITORY` — registry/repository path the digest belongs to.

Example (`.env.staging.example`):

```dotenv
IMAGE_REPOSITORY=ghcr.io/innov8/innov8-backend
IMAGE_DIGEST=sha256:0000000000000000000000000000000000000000000000000000000000000000
```

### Operational notes

- Digests are immutable: re-running a deploy with the same digest is safe and
  idempotent.
- To roll back, redeploy the previously recorded digest — do not retag.
- Promotion between environments must reuse the exact digest that passed the
  prior environment's checks; rebuilding produces a different digest and is not
  a valid promotion.
- Never commit real digests or registry credentials to the repository; supply
  them via CI secrets or environment configuration.

### 3. Fees

Fee = `escrowed_value * fee_rate`, rounded per the rules above. Fees are charged on the delivered value, not on the loss.

| Escrowed value | Fee rate | Fee |
| --- | --- | --- |
| 10,000 | 0.01 | 100 |
| 10,000 | 0.025 | 250 |
| 10,000 | 0.00 | 0 |

Edge cases:

- Fee rate outside `[0, 1]` is rejected as invalid configuration.
- A zero fee rate is valid and produces a zero fee.
- Fees are never charged on the loss portion of a partial delivery.
- Negative amounts are not expected in settlement output; if produced, they indicate a bug and must fail validation.
- Rounding must never cause the sum of payouts to exceed the escrowed value; any residual unit is assigned to the platform fee bucket, not duplicated.

### 4. Partial delivery outcomes

When only part of a delivery is fulfilled, the escrow splits into delivered value, loss, and fee.

Example: escrowed value `10,000`, delivered `6,000`, loss `4,000`, fee rate `0.01`.

| Bucket | Calculation | Amount |
| --- | --- | --- |
| Delivered value | given | 6,000 |
| Loss | given | 4,000 |
| Fee | 6,000 * 0.01 | 60 |
| Farmer payout | 6,000 - 60 | 5,940 |
| Buyer refund | 4,000 | 4,000 |

Edge cases:

- Delivered `0` (total loss): farmer payout `0`, fee `0`, buyer refund equals escrowed value.
- Delivered equals escrowed value (full delivery): loss `0`, fee charged on full value, buyer refund `0`.
- Delivered plus loss must equal escrowed value; any mismatch fails validation before settlement.
- Failure states (invalid inputs, mismatched totals, out-of-range fee rates) must reject the settlement and leave escrow unchanged; no partial payouts are emitted.

### 5. Failure states summary

| Condition | Outcome |
| --- | --- |
| Escrowed value `0` | Rejected |
| Loss > escrowed value | Rejected |
| Fee rate outside `[0, 1]` | Rejected |
| Delivered + loss != escrowed value | Rejected |
| Negative payout | Rejected |

Rejected settlements must not leak party identifiers or amounts in error messages beyond what the caller already supplied.

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

- **Frontend Required Gate**: `npm ci`, `npm run lint`, `npm run build`, `npm test` in `frontend/`
- **Backend Required Gate**: `npm ci`, `npm run build`, `npm test` in `backend/`
- **Mobile Required Gate**: `npm ci`, `npm run type-check`, `npm run lint` in `mobile/`
- **Contracts Required Gate**: `cargo test` in `contracts/amana_escrow/`

Contact owners through the team's existing channels (issue tracker, team chat, and on-call rotation). Do not embed personal contact details, secrets, or PII 
- **Frontend Required Gate**: `npm ci`, `npm run lint`, `npm run build`, `npm test` in `frontend/`
- **Backend Required Gate**: `npm ci`, `npm run build`, `npm test` in `backend/`
- **Mobile Required Gate**: `npm ci`, `npm run type-check`, `npm run lint` in `mobile/`
- **Contracts Required Gate**: `cargo test` in `contracts/amana_escrow/`

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

---

## 🤝 Pilot Cooperative Onboarding Guide

This guide walks a regional agricultural cooperative through joining the innov8 pilot program. It covers eligibility, environment setup, wallet setup, funding, support, and graduation. It is documentation only and does not change application, contract, or configuration behavior.

### 1. Eligibility

A cooperative is eligible for the pilot when it meets all of the following:

- Registered cooperative or farmer group with an active membership roster.
- At least one designated pilot coordinator who can operate the frontend and mobile apps.
- Buyers and sellers who can complete trades in cNGN/stablecoins on Stellar.
- Agreement to the platform's 1% settlement fee and the negotiable `Loss_Ratio` model.
- A named point of contact for support and dispute escalation.

Coordinators should confirm eligibility with the innov8 team before provisioning wallets or funding accounts.

### 2. Environment

Pilot participants use the standard stack described above. Recommended setup:

- **Frontend:** `frontend/` running against the pilot backend endpoint.
- **Mobile:** `mobile/` for field coordinators and drivers.
- **Backend:** managed by the innov8 team; cooperatives do not run their own backend in the pilot.
- **Contracts:** deployed by the innov8 team on the pilot network; cooperatives do not deploy contracts.

Copy the relevant `.env.example` files as described in the setup sections above. Never commit `.env` files, seed phrases, or private keys. Report suspected secret exposure per [SECURITY.md](./SECURITY.md).

### 3. Wallet Setup

1. Install [Freighter](https://www.freighter.app/) or use [Albedo](https://albedo.link/).
2. Create a dedicated wallet per cooperative entity (not a personal wallet).
3. Back up the recovery phrase offline and store it in a secure, access-controlled location.
4. Connect the wallet to the pilot frontend and confirm the public address is displayed correctly.
5. Register the wallet address with the innov8 pilot coordinator so it can be allowlisted for the pilot.

Do not share recovery phrases with anyone, including innov8 staff. Support will never ask for a recovery phrase or private key.

For step-by-step testnet wallet creation, funding, network selection, and reset procedures, see the [Stellar Testnet Pilot Wallet Guide](./docs/stellar-testnet-pilot-wallet.md).

---

## ⚖️ Mediator Decision-Making Guide

This guide describes how mediators review disputes, handle conflicts of interest, escalate, and protect privacy. It is documentation only and does not change application, contract, or configuration behavior. Mediators act on the existing dispute workflow in the Mediator dashboard; the smart contract enforces the final settlement distribution.

### 1. Evidence Review

When a dispute is opened, the buyer and seller may submit evidence (for example, Proof-of-Delivery video stored on IPFS, driver manifest logs, and trade metadata). Mediators should:

- Confirm the trade is in the `Dispute` state and that the agreed `Loss_Ratio` is visible before reviewing evidence.
- Review all submitted evidence for both parties, not just the first submission.
- Verify that video evidence hashes match the IPFS references recorded for the trade; treat unverifiable or mismatched evidence as unconfirmed.
- Cross-check the driver manifest (driver name, phone, vehicle) against the trade record.
- Record the evidence considered and the reasoning in the dispute notes so the decision is auditable.
- Give both parties a reasonable window to respond before deciding; do not decide on one-sided evidence unless a party fails to respond within the stated window.

### 2. Conflict Handling

- A mediator must decline any dispute where they have a personal, financial, or family relationship with either party, the driver, or the goods involved.
- A mediator must not mediate a dispute for a trade they initiated, funded, or are otherwise party to.
- If a conflict is discovered after review begins, the mediator must stop, disclose the conflict to the innov8 team, and hand the dispute to another mediator.
- Mediators must not accept gifts, payments, or favors from either party in exchange for a favorable outcome.
- Decisions must be based only on the evidence and the agreed `Loss_Ratio`, not on the parties' reputation scores alone.

### 3. Escalation

Escalate a dispute to the innov8 team when any of the following applies:

- Evidence is missing, contradictory, or cannot be verified against IPFS references.
- The parties allege fraud, theft, or threats, or the situation appears unsafe.
- The dispute involves amounts or patterns that suggest abuse of the pilot.
- A conflict of interest cannot be resolved by reassignment.
- A technical failure (for example, an unreadable video or a failed settlement transaction) blocks a decision.

When escalating, share only the trade identifier, the dispute state, and the evidence references needed to act. Do not paste recovery phrases, private keys, or full personal contact details into escalation channels.

### 4. Privacy Expectations

- Access evidence only for disputes assigned to you; do not browse unrelated trades.
- Do not download, copy, or redistribute evidence outside the dispute workflow.
- Do not share parties' personal data (names, phone numbers, addresses, wallet recovery material) with third parties.
- Redact personal data from dispute notes and escalation messages where it is not needed to decide the dispute.
- Report any suspected data exposure or secret leak per [SECURITY.md](./SECURITY.md).

### 5. Failure States

- If evidence cannot be loaded, do not guess the outcome; escalate and leave the dispute open.
- If a settlement transaction fails, do not retry with altered parameters; escalate so the innov8 team can investigate.
- If a party stops responding, document the attempts and the response window before deciding.

---

- [Security Policy](./SECURITY.md) — privately report vulnerabilities through GitHub's private vulnerability reporting.
- [Threat Model](./docs/threat-model.md) — reviewed quarterly and on trigger events; see §8 for cadence/ownership and `docs/threat-model-review-checklist.md` for the reviewer checklist.
- [Secrets Policy & Rotation](./docs/secrets-policy.md) — secrets inventory (owner, location, max-age), rotation automation, and verification. Rotation reminders
e window before deciding.

---

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

