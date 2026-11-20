# Architecture and Data Flow

This document describes the backend architecture, the main data flows, and the
service ownership map for the innov8 platform. It is the entry point for
contributors and operators who need to understand how the backend is wired
together and who to contact when something breaks.

## Ownership map

The table below maps each area of the platform to a primary owner role, a
backup owner role, and the escalation path. Owners are expressed as **roles**
(not individuals) so this document does not embed personal data. Role
membership is maintained in the team directory referenced from the README.

| Area | Primary owner | Backup owner | Escalation path |
| --- | --- | --- | --- |
| Backend API (`backend/`) | Backend lead | Backend on-call | Backend lead → Engineering manager → Security on-call (for auth/PII) |
| Data layer (DB, migrations, seeds) | Backend lead | Data steward | Backend lead → Data steward → Engineering manager |
| Frontend web app (`frontend/`) | Frontend lead | Frontend on-call | Frontend lead → Engineering manager |
| Mobile app (`mobile/`) | Mobile lead | Mobile on-call | Mobile lead → Engineering manager |
| Smart contracts (`contracts/`) | Contracts lead | Security reviewer | Contracts lead → Security reviewer → Security on-call |
| CI / release tooling | Release engineer | Backend lead | Release engineer → Engineering manager |

### Escalation tiers

1. **Primary owner** — first responder for questions, reviews, and incidents in
their area. Reachable through the team channel listed in the README.
2. **Backup owner** — takes over when the primary is unavailable (time zones,
   leave, or incident overload).
3. **Security / on-call escalation** — for suspected secret exposure, PII
   incidents, authorization bugs, or contract security issues. Page the
   security on-call through the incident process; never paste secrets, tokens,
   or personal data into issues, PRs, or chat.

### How to reach owners

- Use the team communication channels documented in the top-level `README.md`.
- For security-sensitive reports, follow the responsible disclosure process in
  the repository security policy rather than opening a public issue.
- Do not include credentials, API keys, or customer PII in escalation messages;
  reference the affected resource by ID instead.

### Updating this map

When an area gains or loses an owner, or an escalation path changes, update the
corresponding row in the table above in the same pull request that changes the
responsibility. Keep owners as roles, not names, and keep this document free of
secrets and PII.

## Data flow overview

The backend exposes a REST API consumed by the web and mobile clients. Requests
are authenticated, validated, and then handled by the service layer, which
persists state through the data layer. Smart contracts on-chain hold escrow
state and are reconciled by backend jobs. See the sections below for the
detailed flows.
