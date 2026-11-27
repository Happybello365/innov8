# Security Policy

## Reporting a Vulnerability

# Security Policy

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately. Use GitHub's private
vulnerability reporting for this repository: open the repository's **Security**
tab and select **Report a vulnerability**. This creates a private discussion
with the maintainers. Do not disclose vulnerability details in public issues,
pull requests, discussions, or other public channels.

If private vulnerability reporting is unavailable, contact the repository
maintainers through GitHub and ask for a private reporting channel. Share only
the minimum information needed to establish contact until a private channel is
available.

Include a description of the issue, affected component and versions or commit,
steps to reproduce, potential impact, and any suggested mitigation. Please
avoid accessing or modifying other users' data, disrupting services, or using
real funds; use local environments and test networks.

## Scope

This policy covers security vulnerabilities in this repository's code and
configuration, including:

- Stellar/Soroban smart contracts in `contracts/`
- Backend services and APIs in `backend/`
- Web and mobile applications in `frontend/` and `mobile/`
- Repository-owned infrastructure, deployment configuration, and CI workflows

Third-party services and infrastructure are out of scope unless the issue is
caused by this repository's integration or configuration. Findings that do not
create a security risk, and social-engineering attacks against users, are also
out of scope.

## Response Times

We aim to:

- Acknowledge a report within **3 business days**.
- Complete initial triage and provide an assessment within **7 business days**.
- Provide an update at least every **14 calendar days** while the report is
  being investigated or remediated.

These are response targets, not a guarantee of a fix by a particular date.
Complex issues may take longer; we will explain delays and keep the reporter
updated. Please coordinate public disclosure with the maintainers and allow
time for investigation and remediation.

## Disclosure Triage SLA

Every report is triaged against the severity tiers below. Timelines are
measured from the moment a report is received through the private channel and
are targets, not guarantees. Business days exclude weekends and repository-wide
holidays.

| Tier | Typical impact | Acknowledge | Triage & response | Remediation target | Disclosure |
| --- | --- | --- | --- | --- | --- |
| **Critical** | Direct loss of funds, private key or escrow compromise, unauthenticated remote code execution | 1 business day | 2 business days | 7 calendar days | Coordinated, within 30 calendar days of the fix |
| **High** | Privilege escalation, authorization bypass, sensitive data exposure | 2 business days | 5 business days | 30 calendar days | Coordinated, within 60 calendar days of the fix |
| **Medium** | Limited-impact data exposure, denial of service, misconfiguration | 3 business days | 7 business days | 90 calendar days | Coordinated, within 90 calendar days of the fix |
| **Low** | Defense-in-depth gaps, hardening, informational findings | 5 business days | 10 business days | Best effort | At maintainer discretion |

- **Acknowledgement** confirms we received the report and opened a private
  channel; it does not confirm the finding.
- **Triage & response** is when we assign a severity tier and share an initial
  assessment, including any request for more information.
- **Remediation target** is the goal for a fix or mitigation on the default
  branch. Complex issues may take longer; we will explain delays and keep the
  reporter updated at least every **14 calendar days**.
- **Disclosure** is coordinated with the reporter. We will credit reporters who
  wish to be acknowledged and will not publish details that could endanger
  users or funds before a fix is available.

### Edge Cases and Failure States

- **Disputed severity.** If the reporter and maintainers disagree on the tier,
  we default to the higher tier until triage is complete and document the
  rationale in the private report. Reporters may escalate to a second
  maintainer for review.
- **Incomplete reports.** If a report lacks reproduction steps or affected
  versions, we acknowledge it and request the missing details. The triage clock
  pauses until the information is provided, then resumes from the original
  receipt date.
- **Third-party dependencies.** For vulnerabilities in upstream dependencies or
  third-party services, we coordinate with the upstream maintainer, track the
  report internally, and keep the reporter informed. Remediation timelines may
  depend on the upstream project's release schedule.
- **Actively exploited issues.** Reports indicating active exploitation are
  treated as **Critical** regardless of initial tier and may trigger an
  out-of-band mitigation before a full fix.
- **No response from reporter.** If a reporter becomes unresponsive, we retain
  the report privately and proceed with remediation; disclosure follows the
  tier timelines above.

## Supported Versions

Security fixes are applied to the latest release on the `main` branch. Older
releases may not receive patches. The latest version on the default branch is
supported for security reports. Reports affecting released versions are
welcome; include the affected version or commit so maintainers can assess
impact.

## Handling Sensitive Data

Never commit secrets, private keys, API tokens, or personal data to the repository. Use the provided `.env.example` files as templates and keep real credentials in your local environment or a secrets manager.

## Supply-Chain Provenance Attestation

Release artifacts are accompanied by build provenance metadata so that
consumers can verify where and how an artifact was produced before deploying
it. This follows the SLSA provenance model (in-toto attestation statement with
a SLSA provenance predicate).

### Generating provenance

Provenance is generated by the existing release/build workflow. Each release
publishes, alongside the artifact:

- `<artifact>` — the built release artifact.
- `<artifact>.intoto.jsonl` — the in-toto/SLSA provenance attestation.
- `<artifact>.sha256` — the artifact digest used to bind the attestation.

Provenance is only produced from the trusted release workflow on `main`; local
or ad-hoc builds do not emit attestations.

### Verifying provenance

Before consuming or deploying a release artifact, verify its attestation and
fail closed on any mismatch:

1. Download the artifact, its `.intoto.jsonl` attestation, and its `.sha256`
digest from the same release.
2. Confirm the artifact digest matches the value recorded in the attestation
   and in the `.sha256` file. A mismatch MUST abort the deployment.
3. Confirm the attestation was produced by the expected release workflow and
   source repository/ref. An attestation from an unexpected builder or ref MUST
   be rejected.
4. Only proceed with deployment when all checks pass. If the attestation is
   missing, malformed, or cannot be verified, treat the artifact as untrusted
   and do not deploy it.

### Failure handling

Verification fails closed: missing, expired, or mismatched provenance blocks
consumption of the artifact. Verification tooling must never log secrets,
tokens, or personally identifiable information; only artifact digests and
verification outcomes should be recorded.

## Threat-Model Abuse-Case Index

This index enumerates the abuse cases we explicitly threat-model, grouped by
trust domain. Each entry lists the abuse case, the mitigating control(s), and
the automated test(s) that exercise the control. Tests are referenced by their
stack and suite name; run the smallest relevant stack command (see the README
for the affected stack) to execute them. Examples use synthetic identifiers
only — never include real secrets, keys, or personal data in reports or tests.

### Trust

| Abuse case | Control(s) | Test reference |
| --- | --- | --- |
| Forged or replayed auth token grants access | Signature verification, short token TTL, nonce/replay cache | `backend` auth suite: token verification and replay rejection |
| Privilege escalation via role claim tampering | Server-side role resolution, deny-by-default authorization | `backend` authorization suite: role tampering rejected |
| Cross-tenant data access | Tenant scoping on every query, ownership checks | `backend` authorization suite: cross-tenant access denied |

### Evidence

| Abuse case | Control(s) | Test reference |
| --- | --- | --- |
| Tampered evidence file accepted | Content hash verification against recorded digest | `backend` evidence suite: hash mismatch rejected |
| Evidence substitution after upload | Immutable storage keys, digest re-check on read | `backend` evidence suite: substitution detected |
| Unauthorized evidence download | Authorization check on evidence retrieval | `backend` evidence suite: unauthorized read denied |

### Wallet

| Abuse case | Control(s) | Test reference |
| --- | --- | --- |
| Signature replay across transactions | Per-transaction nonce and domain separation | `contracts` escrow suite: replayed signature rejected |
| Unauthorized fund movement | On-chain authorization checks, signer validation | `contracts` escrow suite: unauthorized caller rejected |
| Address/amount mismatch on settlement | Explicit amount and recipient validation before transfer | `contracts` escrow suite: settlement validation failures |

### Webhook

| Abuse case | Control(s) | Test reference |
| --- | --- | --- |
| Forged webhook payload | HMAC signature verification with shared secret | `backend` webhook suite: invalid signature rejected |
| Replayed webhook delivery | Idempotency keys and delivery dedupe | `backend` webhook suite: duplicate delivery ignored |
| Webhook secret leakage in logs | Redaction of secrets in structured logs | `backend` observability suite: secret redaction |

### Admin

| Abuse case | Control(s) | Test reference |
| --- | --- | --- |
| Unauthorized admin action | Admin role gate, deny-by-default checks | `backend` admin suite: non-admin action denied |
| Destructive admin action without audit trail | Mandatory audit logging for admin mutations | `backend` admin suite: audit entry emitted |
| Admin credential misuse | Least-privilege scopes, rotation guidance | `backend` admin suite: scope enforcement |

When adding a new abuse case, add a row here, the mitigating control, and the
automated test that proves the control holds. If a control has no test yet,
open a follow-up issue rather than documenting an unverified control.

## Architecture Ownership Map

Each area of the codebase has a named owner role and an escalation path. This
map is the source of truth for who to contact about a component and how to
escalate when the primary owner is unavailable. It is documentation only; it
does not grant access or change any runtime behavior.

### Areas and Owners

| Area | Path | Primary owner role | Backup owner role |
| --- | --- | --- | --- |
| Smart contracts | `contracts/` | Contracts lead | Backend lead |
| Backend services and APIs | `backend/` | Backend lead | Contracts lead |
| Web application | `frontend/` | Frontend lead | Backend lead |
| Mobile application | `mobile/` | Mobile lead | Frontend lead |
| Infrastructure and CI | `.github/`, deployment config | Platform/DevOps lead | Backend lead |

Owners are identified by role, not by personal contact details. To reach a role,
use the repository's GitHub team mentions or open a discussion and tag the
relevant team; do not publish personal email addresses, phone numbers, or other
PII in this file.

### Escalation Path

1. **Primary owner** — the role listed for the affected area. Contact first for
   design questions, reviews, and routine incidents.
2. **Backup owner** — the role listed in the backup column. Escalate here when
   the primary owner is unavailable or does not respond within the response
   targets above.
3. **Security / on-call** — for suspected vulnerabilities, active incidents, or
   anything involving secrets, funds, or user data, escalate immediately to the
   security process in the sections above and to the on-call rotation. Do not
   wait for the primary owner before reporting a security issue.

### Updating This Map

When ownership changes, update the table above in the same pull request that
changes the area's maintainers. Keep entries limited to role names and paths so
no secrets or PII are committed. If an area is added or removed, add or remove
its row here so the map stays discoverable from this security policy.

---

# Dispute Participant Evidence Guide

This guide explains what evidence buyers, sellers, and drivers may submit when opening or responding to a dispute, the accepted formats, and how to submit it safely. It applies to the escrow dispute workflow reachable from the relevant order/dispute screens.

## Who can submit evidence

- **Buyers** — evidence that goods or services were not delivered as agreed, were damaged, or did not match the listing.
- **Sellers** — evidence that goods or services were delivered as agreed, or that the buyer's claim is inaccurate.
- **Drivers** — evidence about pickup, transit, and delivery conditions relevant to the dispute.

Only participants to the order may submit evidence for that order's dispute. Submissions from unrelated accounts are rejected.

## What evidence you may submit

- Photos of goods, packaging, labels, or delivery conditions.
- Delivery or pickup receipts and signed handover notes.
- Order, shipment, or tracking references already associated with the order.
- Written statements describing what happened, with dates and times.
- Chat or message excerpts that are directly relevant to the dispute.

## Accepted formats

- Images: JPG, PNG, or PDF.
- Documents: PDF or plain text.
- Keep each file reasonably small and clearly named (for example `delivery-photo-2024-05-01.jpg`).

## How to submit evidence

1. Open the order associated with the dispute.
2. Select the dispute and choose **Submit evidence**.
3. Add a short description and attach the relevant files.
4. Review your submission and confirm.

Submitted evidence is visible to the other participants and to dispute reviewers. Submit only what is necessary to support your case.

## What NOT to submit

To protect yourself and others, **do not** include:

- Passwords, private keys, seed phrases, API tokens, or wallet credentials.
- Full bank account, card, or payment credentials.
- Government ID numbers, full home addresses, or other personal data not needed for the dispute.
- Personal data about people who are not part of the dispute.

If you accidentally submit sensitive information, contact the maintainers immediately so it can be removed.

## Edge cases and failure states

- **Unsupported file type or oversized file** — the submission is rejected; convert or resize the file and try again.
- **Missing description** — a short description is required so reviewers understand the evidence.
- **Submission after the dispute window closes** — late evidence may not be accepted; check the dispute status before submitting.
- **Upload failure** — retry the submission; if it keeps failing, contact support and reference the order ID (never include credentials in the message).
- **Duplicate submissions** — submitting the same evidence again is unnecessary; update your statement instead.

---

# Mediator Decision-Making Guide

This guide describes how mediators review evidence, handle conflicts, escalate, and protect privacy when resolving escrow disputes. It applies to the mediator review workflow reachable from the dispute review screens.

## Evidence review

1. Confirm you are assigned to the dispute and that all participants have had a reasonable window to submit evidence.
2. Read each participant's statement and attachments in full before forming a view.
3. Check that evidence is relevant to the order and the specific claim; disregard unrelated material.
4. Weigh evidence by relevance and consistency, not by volume. Note gaps or contradictions.
5. Record a short, factual rationale for your decision that references the evidence considered.

## Conflict handling

- **Conflicting accounts** — compare against objective records (order, shipment, tracking, receipts) and ask participants for clarification before deciding.
- **Conflicting evidence** — prefer verifiable, dated, order-linked evidence over unsupported statements.
- **Conflict of interest** — if you have a personal or financial relationship with any participant, recuse yourself and escalate to another mediator.
- **Incomplete evidence** — request the missing item once with a clear deadline; do not decide solely on absence unless the window has closed.

## Escalation

Escalate to a senior mediator or maintainer when:

- The dispute involves suspected fraud, threats, or illegal activity.
- Evidence suggests compromised accounts, keys, or credentials.
- Participants dispute the applicable policy or the decision would set a precedent.
- You cannot reach a decision within the review window.

When escalating, share only the order ID, a factual summary, and the relevant evidence references — never credentials or unrelated personal data.

## Privacy expectations

- Access only the evidence needed to decide the dispute.
- Do not copy, forward, or store participant evidence outside the review workflow.
- Do not disclose one participant's personal data to another beyond what is necessary to resolve the dispute.
- Redact sensitive details (IDs, addresses, payment data) from decision rationales.
- Report any accidental exposure of sensitive data to the maintainers immediately.

## Edge cases and failure states

- **Missing or unreadable evidence** — request a resubmission with a deadline; document the request.
- **Late evidence** — accept only if the review window is still open; otherwise note it and proceed.
- **Recusal required** — hand off promptly and avoid reviewing the dispute further.
- **Escalation unavailable** — pause the decision and notify the maintainers rather than deciding alone.
- **Suspected credential leak** — stop, escalate, and do not reproduce the sensitive content in notes or messages.

