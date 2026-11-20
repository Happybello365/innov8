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

Never commit `.env` or `.env.tracing`; they hold secrets (Supabase keys, Pinata JWT, Stellar keys).
If a required variable is missing the server fails fast at startup with a clear error instead of
running with partial configuration.

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

## Local Full-Stack Development

This section describes one reproducible setup that brings up every Amana stack
(frontend, backend, mobile, contracts, Supabase, and tracing) on a single machine.

### Ports and services

| Service | Default URL / port | Notes |
| --- | --- | --- |
| Backend API | `http://localhost:3000` | Express server (`npm run dev`) |
| Frontend | `http://localhost:5173` | Vite dev server |
| Mobile | Expo dev client | Connects to backend via `EXPO_PUBLIC_API_URL` |
| Supabase | `http://localhost:54321` | `supabase start` local stack |
| Jaeger UI | `http://localhost:16686` | Trace viewer |
| OTLP collector | `http://localhost:4318` | HTTP trace ingest |

### 1. Supabase (database + auth)

```bash
# from repo root
supabase start          # boots Postgres, Auth, Storage, Studio locally
supabase db reset       # applies migrations + seed data
```

Copy the printed `API URL` and `anon`/`service_role` keys into `backend/.env`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
cp .env.tracing.example .env.tracing
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # set VITE_API_URL=http://localhost:3000
npm run dev
```

### 4. Mobile

```bash
cd mobile
npm install
cp .env.example .env         # set EXPO_PUBLIC_API_URL=http://localhost:3000
npm start
```

Use your machine's LAN IP instead of `localhost` when running on a physical device.

### 5. Contracts (Soroban)

```bash
cd contracts
cargo test                   # unit tests for escrow contracts
stellar contract build       # produces WASM artifacts
```

Deploy to a local network with `stellar network start local` before invoking contracts.

### 6. Tracing

Start Jaeger with OTLP enabled, then point the backend at it via `.env.tracing`:

```bash
docker run --rm -p 16686:16686 -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` and restart the backend.
Open `http://localhost:16686` and select the `amana-backend` service to inspect traces.

### Failure states

- If Supabase is not running, backend startup fails fast with a connection error — start
  Supabase first, then the backend.
- If tracing is unreachable, the backend logs a warning and continues serving traffic;
  tracing is best-effort and never blocks requests.
- If a required env var is missing, the process exits with a message naming the variable
  (never printing its value).

## Architecture Ownership Map

This section documents who owns each area of the Amana stack and how to escalate
issues. It is the canonical ownership reference for the backend and its integration
points; the frontend, mobile, and contracts areas are listed here so contributors can
find the right owner from a single place.

Owners are identified by **role**, not by individual name, so this map stays accurate
as the team changes. Do not add personal contact details, phone numbers, or private
emails here — route all contact through the channels below.

### Ownership by area

| Area | Location | Primary owner role | Backup owner role |
| --- | --- | --- | --- |
| Backend API & services | `backend/src/` | Backend Lead | Backend Maintainer |
| Database & migrations | `backend/prisma/` | Backend Lead | Data Maintainer |
| Smart contracts (Soroban) | `contracts/` | Contracts Lead | Contracts Maintainer |
| Frontend web app | `frontend/` | Frontend Lead | Frontend Maintainer |
| Mobile app | `mobile/` | Mobile Lead | Mobile Maintainer |
| Infrastructure & tracing | `backend/.env.tracing.example`, CI | Platform/DevOps Lead | Backend Lead |
| Security review | repo-wide | Security Lead | Platform/DevOps Lead |

### Escalation path

Escalation follows three tiers. Always start at the lowest tier that can resolve the
issue, and move up only when the previous tier is unresponsive or the issue crosses
into their area.

1. **Primary owner** — the role listed in the table above for the affected area.
   Open a GitHub issue and assign it to the owner role; this is the default path for
   bugs, feature requests, and documentation gaps.
2. **Backup owner** — if the primary owner does not respond within one business day,
   or is unavailable, escalate to the backup owner role for the same area.
3. **Cross-cutting escalation** — for security incidents, suspected secret exposure,
   data-loss risk, or production outages, escalate directly to the **Security Lead**
   and **Platform/DevOps Lead** via the private security channel described in
   `SECURITY.md`. Do not post exploit details, secrets, or PII in public issues.

### How to reach owners

- **Non-sensitive issues**: open a GitHub issue and assign the owner role.
- **Security-sensitive issues**: follow the private disclosure process in `SECURITY.md`.
- **Production incidents**: page the on-call engineer through the platform's incident
  channel; the on-call engineer then pulls in the relevant area owner.

Never include secrets, API keys, wallet private keys, or personal data in issues,
PRs, or escalation messages. Reference the affected variable or file by name only.

### Updating this map

When ownership changes (a new area is added, or a role is reassigned), update the
table above in the same PR that introduces the change. Keep entries role-based and
free of personal contact details. If a new stack area is added to the monorepo, add a
row for it here so it is discoverable from the existing backend workflow.

## Notes

- `prisma/` contains schema and seed logic for the backend database.
- `src/` contains the Express server, routes, middleware, services, and docs.
- `dist/` is the compiled output directory created by `npm run build`.

## Repository Scope

This backend service lives inside the `backend/` folder of the Amana monorepo and provides the API, database, and infrastructure integration for the project.
