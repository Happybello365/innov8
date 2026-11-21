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

## Database Backup Verification

Backups must be encrypted at rest, restorable, and covered by documented retention
controls. The verification procedure below is the operational runbook for confirming
those guarantees. It is intentionally fail-closed: if encryption metadata is missing
or invalid, or a restore check cannot be completed, treat the backup as unusable and
escalate rather than assuming it is safe.

### Encryption verification

1. Confirm the backup artifact reports an encryption algorithm and key identifier
   (e.g. `AES-256-GCM` + KMS key id). Missing or unrecognized metadata is a failure.
2. Confirm the artifact is not stored in plaintext (no unencrypted dumps in the bucket).
3. Confirm the encryption key is managed by the KMS/secret store and is not embedded
   in the artifact or logs.

### Restorability verification

1. Restore the latest backup into an isolated, non-production database.
2. Run a schema + row-count sanity check against expected tables.
3. Record the result (pass/fail, timestamp, backup id) without logging row contents,
   credentials, or PII.
4. On failure, do not promote the backup; open an incident and retry the restore check.

### Retention controls

- Retention windows are defined per environment and enforced by the storage lifecycle
  policy; do not delete backups manually outside the documented policy.
- Verification results are retained alongside the backup metadata for audit.
- Any change to retention or encryption settings requires a documented review.

## Notes

- `prisma/` contains schema and seed logic for the backend database.
- `src/` contains the Express server, routes, middleware, services, and docs.
- `dist/` is the compiled output directory created by `npm run build`.

## Repository Scope

This backend service lives inside the `backend/` folder of the Amana monorepo and provides the API, database, and infrastructure integration for the project.
