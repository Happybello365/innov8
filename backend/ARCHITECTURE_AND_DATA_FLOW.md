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

## High-level layers

- **API layer** (`backend/src/routes`, controllers): validates requests, enforces
authorization, and shapes responses.
- **Service layer** (`backend/src/services`): business logic, orchestration, and
transaction building.
- **Integration layer** (`backend/src/stellar`, `backend/src/payments`): talks to
Horizon/Soroban, builds and submits Stellar transactions, and reconciles results.
- **Persistence layer** (`backend/src/models`, migrations): stores escrow state,
orders, and payment records.

## Request flow

1. A client calls an API endpoint (for example, to fund an escrow or trigger a
   payout).
2. The controller validates input and checks authorization.
3. The service layer assembles the operation, including any path-payment
   parameters.
4. The integration layer submits the transaction to Stellar and records the
   result.
5. The persistence layer stores the final state and any reconciliation data.

## Path payments (NGN to cNGN)

Innov8 lets buyers pay in NGN while the escrow settles in cNGN. This is done with
a Stellar **path payment**, which converts one asset into another during the same
transaction.

### In plain language

- The buyer sends NGN (or an NGN-backed asset).
- Stellar finds a route through the order book that converts NGN into cNGN.
- The escrow receives cNGN, and the buyer's NGN is spent.
- If no route can deliver the required cNGN within the buyer's limits, the
  transaction fails and nothing is moved.

### Slippage

Slippage is the difference between the amount you expect to receive and the
amount you actually receive after the conversion. Prices can move between the
moment a payment is prepared and the moment it settles.

To protect users, every path payment carries a **destination minimum** (the
least cNGN the escrow will accept) and a **source maximum** (the most NGN the
buyer will spend). If the market cannot meet those limits, the payment is
rejected rather than executed at a worse rate. Users should treat these limits
as their slippage tolerance: a tighter limit means less risk of a bad rate but a
higher chance the payment needs to be retried.

### Fees

A path payment can involve several costs:

- **Network fee**: the Stellar base fee for submitting the transaction.
- **Conversion cost**: the effective rate achieved through the order book,
  which is bounded by the slippage limits above.
- **Service fee**: any platform fee configured for the escrow flow.

All fees are surfaced before submission so the buyer can see the total cost of
the payment.

### Retry behavior and failure states

Path payments can fail for reasons outside the user's control, such as a route
disappearing or the rate moving past the slippage limit. The backend handles
this as follows:

- **No route / insufficient liquidity**: the payment is rejected and the user is
  asked to retry, optionally with a wider slippage tolerance.
- **Slippage exceeded**: the transaction is not submitted; the user can refresh
  the quote and retry.
- **Transient network errors**: the submission is retried with backoff up to a
  configured limit.
- **Definitive failures** (for example, insufficient balance or an invalid
  destination): the payment is marked failed and the user is shown a clear
  reason.

Retries never double-spend: each attempt is idempotent and reconciled against
the recorded payment intent before a new submission is made. Failure states are
persisted so operators can audit what happened without exposing secrets or
personal data.

## Data flow overview

The backend exposes a REST API consumed by the web and mobile clients. Requests
are authenticated, validated, and then handled by the service layer, which
persists state through the data layer. Smart contracts on-chain hold escrow
state and are reconciled by backend jobs. See the sections below for the
detailed flows.
