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

## Path Payments (NGN → cNGN) — User Guide

When a buyer pays for a trade, they can pay in **NGN** (their local currency) while the
escrow holds value in **cNGN** (the stablecoin used for settlement). Amana does this with a
Stellar **path payment**: the network finds a route from NGN to cNGN and converts the
amount in a single transaction, so the buyer never has to hold cNGN themselves.

### How a path payment works, in plain language

1. The buyer confirms the trade amount in NGN.
2. Amana asks Stellar to convert that NGN into cNGN along the best available path.
3. The converted cNGN is deposited into the escrow contract and held until delivery is verified.
4. On successful delivery, settlement runs as described in the loss-sharing examples below.

If no route exists or the route cannot deliver the required cNGN, the payment fails and
**no funds move** — the buyer is not charged.

### Slippage

Prices on the Stellar network can move slightly between the moment a quote is shown and
the moment the transaction is submitted. **Slippage** is the small difference between the
expected cNGN amount and the amount actually received.

- Amana sets a **maximum slippage tolerance** on every path payment. If the route would
deliver less cNGN than the tolerance allows, the transaction is rejected instead of
silently accepting a worse rate.
- The buyer sees the quoted amount and the tolerance before confirming. If the rate moves
beyond the tolerance, they can retry to get a fresh quote.
- Slippage protection is a safety limit, not a fee — it never costs the buyer money on its own.

### Fees

Path payments involve two separate costs, and it helps to keep them apart:

- **Network fee**: a small Stellar network fee (a fraction of a cent) paid to submit the
transaction. It is charged only when a transaction is actually submitted.
- **Platform fee**: the flat **1%** Amana fee, deducted from the settled trade value at
settlement time (see the loss-sharing examples). It is not part of the path payment itself.

Conversion along the path does not add a hidden Amana markup; the buyer pays the quoted
NGN amount plus the network fee.

### Retry behavior and failure states

Path payments can fail for reasons outside anyone's control (rate movement, temporary
liquidity gaps, network congestion). Amana handles these predictably:

- **Slippage exceeded**: the transaction is rejected before funds move. The buyer can retry
  to receive a fresh quote; nothing is deducted.
- **No path found**: Stellar could not find a route from NGN to cNGN. The payment fails
  cleanly and the buyer is prompted to retry later.
- **Insufficient balance**: the buyer's NGN balance does not cover the quoted amount plus the
  network fee. The payment is rejected with a validation error and no funds move.
- **Network/timeout errors**: transient failures are safe to retry. Amana never double-charges;
  a transaction that did not confirm on-chain is not treated as paid.
- **Already-settled trade**: retries against a trade that has already been funded or settled
  are rejected so the escrow cannot be funded twice.

In every failure case the escrow balance is unchanged, and error responses never include
wallet secrets, private keys, or personal data.

## Loss-Sharing Examples Workbook

Worked examples for how escrow settlement splits funds between buyer and seller when a
trade completes fully, partially, or fails in transit. All amounts are in cNGN and use
whole-unit arithmetic; the platform fee is a flat **1%** of the settled trade value.

### Conventions

- `tradeValue` — agreed price of the goods (cNGN).
- `lossRatio` — seller's share of any transit loss, expressed as a percentage (e.g. `50` = 50/50 split, `70` = 70/30 split where the seller bears 70%).
- `platformFee` — `floor(tradeValue * 0.01)` in cNGN, deducted from the settled amount before loss sharing.
- Rounding is always **down** (floor) to the nearest whole cNGN so the escrow never pays out more than it holds. Any remainder stays in the escrow contract.

### Example 1 — Full delivery, 50/50 loss ratio

| Field | Value |
| --- | --- |
| tradeValue | 100,000 cNGN |
| platformFee (1%) | 1,000 cNGN |
| settled amount | 99,000 cNGN |
| loss | 0 cNGN |
| seller payout | 99,000 cNGN |
| buyer refund | 0 cNGN |

No loss occurred, so the loss ratio is not applied. The seller receives the full settled amount.

### Example 2 — Partial delivery with a 50/50 loss ratio

| Field | Value |
| --- | --- |
| tradeValue | 100,000 cNGN |
| platformFee (1%) | 1,000 cNGN |
| settled amount | 99,000 cNGN |
| loss (spoilage in transit) | 20,000 cNGN |
| seller bears (50%) | 10,000 cNGN |
| buyer bears (50%) | 10,000 cNGN |
| seller payout | 89,000 cNGN |
| buyer refund | 10,000 cNGN |

### Example 3 — Partial delivery with a 70/30 loss ratio

| Field | Value |
| --- | --- |
| tradeValue | 100,000 cNGN |
| platformFee (1%) | 1,000 cNGN |
| settled amount | 99,000 cNGN |
| loss | 20,000 cNGN |
| seller bears (70%) | 14,000 cNGN |
| buyer bears (30%) | 6,000 cNGN |
| seller payout | 85,000 cNGN |
| buyer refund | 6,000 cNGN |

### Example 4 — Rounding with an odd trade value

| Field | Value |
| --- | --- |
| tradeValue | 10,001 cNGN |
| platformFee (1%, floored) | 100 cNGN |
| settled amount | 9,901 cNGN |
| loss | 1,001 cNGN |
| seller bears (50%, floored) | 500 cNGN |
| buyer bears (remainder) | 501 cNGN |
| seller payout | 9,401 cNGN |
| buyer refund | 501 cNGN |

`10,001 * 0.01 = 100.01` floors to `100`. `1,001 * 0.5 = 500.5` floors to `500` for the
seller; the buyer absorbs the remaining `501` so the two shares always sum to the loss.

### Example 5 — Total loss in transit

| Field | Value |
| --- | --- |
| tradeValue | 50,000 cNGN |
| platformFee (1%) | 500 cNGN |
| settled amount | 49,500 cNGN |
| loss | 50,000 cNGN |
| seller payout | 0 cNGN |
| buyer refund | 49,500 cNGN |

When the loss equals or exceeds the trade value, the seller receives nothing and the
buyer is refunded the full settled amount. The platform fee is still retained.

### Edge cases and failure states

- **Loss exceeds trade value**: clamp the loss to `tradeValue`; the buyer refund never exceeds the settled amount.
- **Zero or negative trade value**: reject the settlement request with a validation error; no funds move.
- **Loss ratio outside 0–100**: reject with a validation error rather than silently clamping.
- **Fee rounding**: always floor the fee so the escrow cannot overdraw; the remainder stays in escrow.
- **Disputed PoD**: settlement is blocked until the dispute is resolved; no partial payouts are issued.

These examples contain no wallet addresses, personal data, or secrets and are safe to
share in issues and pull requests.

## Notes

- `prisma/` contains schema and seed logic for the backend database.
- `src/` contains the Express server, routes, middleware, services, and docs.
- `dist/` is the compiled output directory created by `npm run build`.

## Repository Scope

This backend service lives inside the `backend/` folder of the Amana monorepo and provides the API, database, and infrastructure integration for the project.
