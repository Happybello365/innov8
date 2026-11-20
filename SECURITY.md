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

## Supported Versions

The latest version on the default branch is supported for security reports.
Reports affecting released versions are welcome; include the affected version
or commit so maintainers can assess impact.

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
