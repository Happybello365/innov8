# 🌾 innov8: Trust as a Service for Agricultural Products

![Stellar](https://img.shields.io/badge/Network-Stellar-black?style=for-the-badge&logo=stellar)
![Soroban](<https://img.shields.io/badge/Contracts-Soroban%20(Rust)-orange?style=for-the-badge>)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**innov8** is a decentralized escrow protocol designed to secure agricultural trade across different regions. By leveraging **Soroban Smart Contracts**, Amana eliminates the "Trust Gap" between buyers and sellers, ensuring fair trade even when parties are hundreds of miles apart.

This is the main repository containing the smart contracts and orchestration logic. Backend, frontend, and mobile applications are maintained in this monorepo for simpler development and unified deployment.

---

## 🚀 The Mission

To provide a programmable safety net for regional commodity trading. Amana ensures that the risk of "sending first" is eliminated, replaced by a secure, neutral vault that only releases funds when delivery is verified.

## 🛠 Features

- **Smart Escrow:** Secure funds holding using cNGN/stablecoins on the Stellar network.
- **Dynamic Loss Sharing:** Negotiable risk-sharing ratios (e.g., 50/50, 70/30) hardcoded into every trade to handle transit accidents or theft.
- **Proof-of-Delivery (PoD):** An optional video-based verification protocol involving the buyer and the driver to confirm the state of goods. Video evidence can be submitted and stored on IPFS for dispute resolution.
- **Volatility Protection:** Utilizes Stellar Path Payments to allow users to pay in local currency (NGN) while locking value in cNGN.
- **Automated Settlement:** A flat 1% platform fee is automatically deducted upon successful trade completion.

## 🏗 Technical Stack

- **Frontend:** [Next.js](https://nextjs.org/) (App Router)
- **Smart Contracts:** [Soroban](https://soroban.stellar.org/) (Rust)
- **Blockchain:** [Stellar Network](https://www.stellar.org/)
- **Wallet Connection:** [Freighter](https://www.freighter.app/) / [Albedo](https://albedo.link/)
- **Storage:** IPFS (via Pinata) for decentralized storage of video evidence.
- **Database:** Supabase (Off-chain metadata, driver logs, and user profiles).
- **Observability:** OpenTelemetry distributed tracing with correlation IDs for end-to-end request tracking.

## 🧪 Local Environments (Folder-Based)

- `frontend/` → Next.js app environment (UI + wallet + Supabase/Pinata client integration)
- `backend/` → Node.js/TypeScript API environment (Supabase + Pinata + integration endpoints)
- `mobile/` → React Native Expo environment (mobile wallet, notification, and trade UX)
- `contracts/` → Rust/Soroban smart contract environment

### Frontend setup

1. `cd frontend`
2. `cp .env.example .env.local`
3. `npm install`
4. `npm run dev`

### Backend setup

1. `cd backend`
2. `cp .env.example .env`
3. `cp .env.tracing.example .env.tracing` (for distributed tracing configuration)
4. `npm install`
5. `npm run dev`

### Mobile setup

1. `cd mobile`
2. `cp .env.example .env.local`
3. `npm install`
4. `npm start`

### Backend API docs

- Source of truth: `backend/src/docs/openapi.yaml`
- Dev Swagger UI: `http://localhost:4000/api/docs`
- JSON export: `http://localhost:4000/api/docs/openapi.json`

The backend writes `backend/src/docs/openapi.json` from the YAML spec in non-production runs so reviewers can inspect either format.

### Contracts setup

1. `cd contracts/amana_escrow`
2. `cargo build`

## 🔒 Required PR CI Gates

Amana enforces stack-level CI gates on pull requests through `.github/workflows/ci.yml`.

- **Frontend Required Gate**: `npm ci`, `npm run lint`, `npm run build`, `npm test` in `frontend/`
- **Backend Required Gate**: `npm ci`, `npm run build`, `npm test` in `backend/`
- **Mobile Required Gate**: `npm ci`, `npm run type-check`, `npm run lint` in `mobile/`
- **Contracts Required Gate**: `cargo test` in `contracts/amana_escrow/`

Path-aware execution is enabled to avoid unnecessary runtime. If a stack has no changed files, the gate reports a skip-note and passes.

### Branch protection setup (GitHub)

For the protected branch (`main`), set these required status checks:

- `Frontend Required Gate`
- `Backend Required Gate`
- `Contracts Required Gate`

---

---

## 🔄 How It Works (The Amana Flow)

1. **Initiate:** The Seller lists products. The Buyer initiates a trade, depositing funds that are converted to cNGN via a Stellar Path Payment.
2. **Lock:** The Smart Contract locks the funds and stores the agreed-upon `Loss_Ratio`.
3. **Dispatch:** The Seller provides the driver's name, phone number, and vehicle manifest.
4. **Verification:** - **Success:** Buyer receives goods and uploads a confirmation video. Funds release to Seller.
   - **Dispute:** Buyer uploads a video of loss/damage with driver affirmation. A mediator reviews the evidence.
5. **Settlement:** Based on the outcome, funds are distributed (either 100% to one party or split via the `Loss_Ratio`).

---

## 🗺 Roadmap

### Phase 1: The Vault (MVP)

- [x] Develop core Soroban contract logic (`deposit`, `release`, `refund`).
- [x] Implement basic Next.js UI for trade creation.

### Phase 2: The Agreement Engine

- [x] Integrate `Loss_Ratio` variables into the smart contract.
- [x] Build the "Mediator" dashboard for dispute resolution.

### Phase 3: Evidence & Logistics

- [x] IPFS integration for video evidence uploads.
- [x] Driver manifest logging and tracking interface.

### Phase 4: Mainnet & Scale

- [ ] Public pilot program with regional agricultural cooperatives.
- [x] Implementation of a "Trust Score" reputation system.

---

## 🤝 Pilot Cooperative Onboarding Guide

This guide walks a regional agricultural cooperative through joining the innov8 pilot program. It covers eligibility, environment setup, wallet setup, funding, support, and graduation. It is documentation only and does not change application, contract, or configuration behavior.

### 1. Eligibility

A cooperative is eligible for the pilot when it meets all of the following:

- Registered cooperative or farmer group with an active membership roster.
- At least one designated pilot coordinator who can operate the frontend and mobile apps.
- Buyers and sellers who can complete trades in cNGN/stablecoins on Stellar.
- Agreement to the platform's 1% settlement fee and the negotiable `Loss_Ratio` model.
- A named point of contact for support and dispute escalation.

Coordinators should confirm eligibility with the innov8 team before provisioning wallets or funding accounts.

### 2. Environment

Pilot participants use the standard stack described above. Recommended setup:

- **Frontend:** `frontend/` running against the pilot backend endpoint.
- **Mobile:** `mobile/` for field coordinators and drivers.
- **Backend:** managed by the innov8 team; cooperatives do not run their own backend in the pilot.
- **Contracts:** deployed by the innov8 team on the pilot network; cooperatives do not deploy contracts.

Copy the relevant `.env.example` files as described in the setup sections above. Never commit `.env` files, seed phrases, or private keys. Report suspected secret exposure per [SECURITY.md](./SECURITY.md).

### 3. Wallet Setup

1. Install [Freighter](https://www.freighter.app/) or use [Albedo](https://albedo.link/).
2. Create a dedicated wallet per cooperative entity (not a personal wallet).
3. Back up the recovery phrase offline and store it in a secure, access-controlled location.
4. Connect the wallet to the pilot frontend and confirm the public address is displayed correctly.
5. Register the wallet address with the innov8 pilot coordinator so it can be allowlisted for the pilot.

Do not share recovery phrases with anyone, including innov8 staff. Support will never ask for a recovery phrase or private key.

### 4. Funding

1. The innov8 team funds the cooperative's pilot wallet with test cNGN/stablecoins on the pilot network.
2. Cooperatives confirm the balance in the frontend before creating the first trade.
3. Trades lock funds in escrow; the 1% platform fee is deducted automatically on successful settlement.
4. If a trade is disputed, funds are distributed per the agreed `Loss_Ratio` after mediator review.

Pilot funds are for testing only and carry no real-world value. Do not send mainnet assets to pilot wallets.

### 5. Support

- **Security issues:** report privately via [SECURITY.md](./SECURITY.md); do not open public issues for vulnerabilities.
- **Operational issues:** contact the assigned innov8 pilot coordinator.
- **Disputes:** follow the mediator flow described in "How It Works" above; evidence is stored on IPFS.
- **Incidents:** reference the [Threat Model](./docs/threat-model.md) and [Secrets Policy & Rotation](./docs/secrets-policy.md) where relevant.

When reporting an issue, include the trade ID, timestamps, and correlation IDs from the tracing setup — never include recovery phrases, private keys, or personal data.

### 6. Graduation

A cooperative graduates from the pilot when it has:

- Completed a minimum number of successful trades agreed with the innov8 team.
- Resolved any disputes through the mediator flow without unresolved escalations.
- Maintained secure wallet practices with no reported secret exposure.
- Confirmed readiness to move to mainnet with the innov8 team.

Graduation is confirmed in writing by the innov8 team. After graduation, the cooperative operates on mainnet with real cNGN/stablecoins and remains subject to the same security and support policies.

---

## 🔍 Distributed Tracing

Amana includes comprehensive distributed tracing with OpenTelemetry for end-to-end request visibility and faster incident triage.

### Features

- **Correlation IDs**: Unique identifiers spanning frontend-backend requests
- **Request Tracing**: Complete request lifecycle tracking
- **Service Integration**: Automatic tracing for external services (IPFS, Stellar)
- **Observability**: Jaeger, Zipkin, and Prometheus integration

### Quick Start

1. Configure tracing environment variables (see `backend/.env.tracing.example`)
2. Start Jaeger for trace visualization: `docker run -p 16686:16686 jaegertracing/all-in-one`
3. View traces at `http://localhost:16686`
4. Check metrics at `http://localhost:9464/metrics`

### Documentation

See [DISTRIBUTED_TRACING_GUIDE.md](./DISTRIBUTED_TRACING_GUIDE.md) for detailed setup and usage instructions.

---

## 📐 Architecture Decision Records

Key architectural decisions are documented as ADRs in [`docs/adr/`](./docs/adr):

- [ADR-001: Stellar Path Payment Architecture](./docs/adr/ADR-001-stellar-path-payment-architecture.md)
- [ADR-002: Escrow Loss-Sharing Model](./docs/adr/ADR-002-escrow-loss-sharing-model.md)
- [ADR-003: Off-chain vs. On-chain Data Partitioning](./docs/adr/ADR-003-offchain-vs-onchain-data-partitioning.md)
- [ADR-004: Idempotency and Retry Strategy](./docs/adr/ADR-004-idempotency-and-retry-strategy.md)
- [ADR-005: Frontend State Management](./docs/adr/ADR-005-frontend-state-management.md)

## 🔐 Security & Operations

- [Security Policy](./SECURITY.md) — privately report vulnerabilities through GitHub's private vulnerability reporting.
- [Threat Model](./docs/threat-model.md) — reviewed quarterly and on trigger events; see §8 for cadence/ownership and `docs/threat-model-review-checklist.md` for the reviewer checklist.
- [Secrets Policy & Rotation](./docs/secrets-policy.md) — secrets inventory (owner, location, max-age), rotation automation, and verification. Rotation reminders
