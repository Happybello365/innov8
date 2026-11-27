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


## Architecture Ownership Map

Each area of the codebase has a named owner role and an escalation path. This
map is the source of truth for who to contact about a component and how to
escalate when the primary owner is unavailable. It is documentation only; it
doe

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

The latest version on the default branch is supported for security reports.
Reports affecting released versions are welcome; include the affected version
or commit so maintainers can assess impact.
 initial tier and may trigger an
  out-of-band mitigation before a full fix.
- **No response from reporter.** If a reporter becomes unresponsive, we retain
  the report privately and proceed with remediation; disclosure follows the
  tier timelines above.

## Supported Versions

The latest version on the default branch is supported for security reports.
Reports affecting released versions are welcome; include the affected version
or commit so maintainers can assess impact.

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
