# 🌾 Amana Backend Service

The official Node.js/TypeScript backend for **Amana**, a decentralized escrow protocol designed to secure agricultural trade across different regions.

Amana eliminates the "Trust Gap" between buyers and sellers using Soroban Smart Contracts on the Stellar network, ensuring fair trade even when parties are hundreds of miles apart.

## About Amana

**Amana** provides a programmable safety net for regional commodity trading:

- **Smart Escrow**: Secure funds holding using cNGN/stablecoins on the Stellar network
- **Dynamic Loss Sharing**: Negotiable risk-sharing ratios (e.g., 50/50, 70/30) for handling transit accidents
- **Proof-of-Delivery (PoD)**: Mandatory video-based verification involving buyer and driver
- **Automated Settlement**: Flat 1% platform fee deducted upon successful trade completion
- **Volatility Protection**: Stellar Path Payments allow users to pay in local currency (NGN) while locking value in cNGN

## Backend Responsibilities

This service provides the API and infrastructure integration layer for the Amana escrow protocol.
It handles trade orchestration, Supabase metadata, IPFS/Pinata uploads, Stellar payment bridging, and OpenTelemetry tracing.

## Features

- Node.js + TypeScript backend service
- Express API server
- Prisma ORM for database access
- Supabase integration for off-chain metadata
- Pinata SDK for IPFS uploads
- Stellar SDK for transaction and wallet interactions
- OpenTelemetry tracing with Jaeger/Prometheus/Zipkin exporters
- Jest test suite for backend behavior

## Getting Started

### Prerequisites

- Node.js 20+ / npm
- Access to required environment variables
- Supabase database and/or Redis as required by your environment

### Install dependencies

```bash
cd backend
npm install
```

### Environment

Copy the example env files and configure your secrets:

```bash
cp .env.example .env
cp .env.tracing.example .env.tracing
```

### Run in development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run production

```bash
npm run start
```

### Tests

```bash
npm test
```

### Admin Auth Regression Suite

A dedicated CI regression suite (`src/__tests__/admin.auth.ci-regression.test.ts`) covers
admin route authentication and authorization. It validates feature gating, JWT validation,
wallet allowlist enforcement, token revocation, and error response shape consistency.

Run it locally:

```bash
# Using pnpm
pnpm jest --config jest.config.js --forceExit --detectOpenHandles --testPathPatterns='admin\.auth\.ci-regression' --verbose

# Using npm
npx jest --config jest.config.js --forceExit --detectOpenHandles --testPathPatterns='admin\.auth\.ci-regression' --verbose
```

CI runs this suite as a separate named step (`Admin auth regression suite`) so any
regression in admin authentication causes CI to fail independently of the full test suite.

## Pilot Cooperative Onboarding Guide

This guide walks a pilot cooperative through onboarding onto the Amana escrow backend.
It is documentation only and does not change application behavior. Never commit real
secrets, private keys, or member PII to this repository or to shared channels.

### 1. Eligibility

A cooperative is eligible for the pilot when it:

- Is a registered cooperative or farmer/produce aggregation group trading agricultural commodities.
- Has at least one designated operator who can complete KYC and hold a Stellar wallet.
- Can provide a business contact and a support escalation contact (no member PII required at intake).
- Agrees to the escrow terms, the flat 1% platform fee, and the Proof-of-Delivery requirement.

Ineligible or incomplete applications are rejected at intake with a reason; no partial
records are created.

### 2. Environment

Pilot operators use the environment provisioned by the Amana team. Do not point a pilot
cooperative at production secrets or another tenant's database.

- Backend runs with the standard `backend/` setup (see **Getting Started** above).
- Configure `.env` from `.env.example`; keep `.env` and `.env.tracing` out of version control.
- Required integrations: Supabase (metadata), Pinata (IPFS uploads), Stellar (payments).
- Use the Stellar testnet for pilot dry runs before any mainnet funding.

If a required variable is missing, the service fails fast at startup rather than running
in a partially configured state.

### 3. Wallet Setup

1. The cooperative operator creates a Stellar wallet and securely stores the secret key
   offline. The backend never stores or logs private keys.
2. The operator shares only the **public** wallet address with the Amana team for allowlisting.
3. The Amana team confirms the address is registered and the operator can authenticate.
4. The operator verifies they can sign a test transaction on testnet before proceeding.

Loss of a wallet key is handled by re-onboarding a new public address; the old address is
revoked. Never share secret keys in tickets, chat, or pull requests.

See the [Stellar Testnet Pilot Wallet Guide](./docs/stellar-testnet-pilot-wallet.md) for
step-by-step wallet creation, funding, network selection, and reset procedures.

### 4. Funding

- Pilot escrows are funded in cNGN/stablecoins on Stellar; buyers may pay in local currency
  via Stellar Path Payments.
- Start with a small testnet amount to confirm the full escrow → PoD → settlement flow.
- The flat 1% platform fee is deducted automatically on successful settlement.
- Failed or disputed trades follow the loss-sharing ratio agreed at trade creation; funds are
  not released until the dispute is resolved.

### 5. Support

- Operational issues: contact the Amana pilot support contact provided at onboarding.
- Security incidents (suspected key compromise, unauthorized access): report immediately via
  the private escalation channel; do not open a public issue with sensitive details.
- When filing a bug, include the trade ID, timestamps, and error codes — never secrets or PII.

### 6. Graduation

A cooperative graduates from the pilot when it has:

- Completed a minimum number of successful escrow settlements with valid Proof-of-Delivery.
- Had no unresolved disputes or security incidents during the pilot window.
- Confirmed wallet and operator details are current.

On graduation the cooperative moves to standard onboarding with production credentials
provisioned by the Amana team. Graduation status and any exceptions are recorded by the
Amana team, not in this repository.

## Dispute Participant Evidence Guide

This guide explains what evidence buyers, sellers, and drivers may submit when a trade is
disputed, the accepted formats, and how to submit it. It is documentation only and does not
change application behavior. Evidence is attached to the trade's dispute record; funds stay
locked under the agreed loss-sharing ratio until the dispute is resolved.

### Who can submit evidence

- **Buyer** — the party funding the escrow.
- **Seller** — the party supplying the commodity.
- **Driver** — the party transporting the commodity and completing Proof-of-Delivery.

Only participants on the disputed trade may submit evidence for it. Submissions from other
accounts are rejected.

### What to submit

**Buyer**

- Photos or video of the goods as received, including packaging and any damage.
- The delivery receipt or waybill showing date, quantity, and condition on arrival.
- Chat or order records showing the agreed quantity, quality, and delivery terms.

**Seller**

- Photos or video of the goods at loading, showing quantity and condition before transit.
- The weighbridge ticket, invoice, or dispatch note for the shipment.
- Records of the agreed trade terms and any handover confirmation to the driver.

**Driver**

- Proof-of-Delivery video showing the goods and the buyer at handover.
- Photos of the vehicle, load, and any transit incident (accident, spoilage, delay).
- Trip records such as waybills, timestamps, and route or checkpoint notes.

### Accepted formats

- Images: JPEG or PNG.
- Video: MP4.
- Documents: PDF.

Keep each file reasonably small and upload only what is needed to support the claim.

### How to submit

1. Open the disputed trade in the Amana app and select **Submit evidence**.
2. Choose the evidence type and attach the files listed above.
3. Add a short factual description (what happened, when, and where).
4. Submit before the dispute response window closes; late evidence may not be considered.

### Privacy

- Redact unrelated personal data (faces of bystanders, phone numbers, bank details) before upload.
- Never upload secret keys, passwords, or full identity documents.
- Evidence is visible only to the dispute participants and the assigned mediator.

## Mediator Decision-Making Guide

This guide describes how mediators review evidence, handle conflicts, escalate, and protect
privacy when resolving a disputed trade. It is documentation only and does not change
application behavior. Mediators act on the trade's dispute record; funds remain locked under
the agreed loss-sharing ratio until a decision is recorded.

### 1. Evidence review

1. Confirm you are the assigned mediator for the trade before opening any evidence.
2. Read the trade terms first: agreed quantity, quality, delivery terms, and loss-sharing ratio.
3. Review each participant's evidence against the claim it supports, not against the party.
4. Check integrity signals: timestamps, waybill or weighbridge numbers, and whether the
   Proof-of-Delivery video matches the reported handover.
5. Record which evidence you relied on and which you set aside, with a one-line reason each.

If evidence is missing, unreadable, or clearly unrelated, request a clarification from the
submitting participant before deciding. Do not infer facts that no evidence supports.

### 2. Conflict handling

- When participants' accounts conflict, weigh evidence by relevance and verifiability, not
  by who submitted more files.
- Prefer contemporaneous records (waybills, weighbridge tickets, PoD video) over later
  recollections or chat summaries.
- If two credible records conflict and neither can be verified, treat the point as unresolved
  and say so in the decision rationale.
- Never pressure a participant to withdraw a claim, and never share one party's evidence with
  the other beyond what the dispute workflow already exposes.

### 3. Decision and rationale

- Apply the loss-sharing ratio agreed at trade creation; do not invent a new split.
- State the outcome (release, partial release, or refund), the evidence relied on, and any
  unresolved points.
- Keep the rationale factual and free of speculation about participants' character.

### 4. Escalation

Escalate to the Amana dispute lead instead of deciding when:

- Evidence suggests fraud, forged documents, or a compromised account or wallet key.
- The disputed amount or loss-sharing impact exceeds your assigned authority.
- A participant reports a security incident or threatens another participant.
- You have a conflict of interest with any participant on the trade.

When escalating, include the trade ID, a summary of the conflict, and the evidence references —
never secret keys, passwords, or unnecessary PII. Suspected key compromise or unauthorized
access goes through the private security escalation channel, not a public issue.

### 5. Privacy expectations

- Access only the evidence needed for the trade you are assigned to.
- Do not copy evidence out of the dispute record, forward it, or store it on personal devices.
- Redact bystander faces, phone numbers, and bank details before referencing an attachment.
- Never request or accept secret keys, passwords, or full identity documents from participants.
- Report any accidental exposure of participant data to the dispute lead immediately.

### 6. Failure states

- If the dispute record is inaccessible or evidence fails to load, pause and escalate rather
  than deciding on partial information.
- If a decision cannot be recorded, do not tell participants funds have moved; confirm the
  recorded state before communicating any outcome.
- If you are reassigned mid-review, hand over the evidence references and rationale notes to
  the new mediator through the private channel.
