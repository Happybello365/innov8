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

## Notes

- `prisma/` contains schema and seed logic for the backend database.
- `src/` contains the Express server, routes, middleware, services, and docs.
- `dist/` is the compiled output directory created by `npm run build`.

## Repository Scope

This backend service lives inside the `backend/` folder of the Amana monorepo and provides the API, database, and infrastructure integration for the project.
