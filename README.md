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

### Security Disclosure Triage SLA

Vulnerability reports are handled under the timelines below. All times are measured from the moment a report is received through GitHub's private vulnerability reporting channel described in [SECURITY.md](./SECURITY.md). Reports are triaged by the security maintainers on rotation; the reporter is kept informed at each stage.

#### Severity tiers and SLA targets

| Tier | Definition (examples) | Acknowledgement | Initial response / triage | Remediation target | Public disclosure |
| --- | --- | --- | --- | --- | --- |
| **Critical** | Loss of escrowed funds, contract authorization bypass, private key or secret exposure | ≤ 24 hours | ≤ 48 hours | ≤ 7 days | Coordinated, ≤ 7 days after fix ships |
| **High** | Privilege escalation, replay of settlement/webhook events, PII exposure | ≤ 48 hours | ≤ 3 business days | ≤ 14 days | Coordinated, ≤ 14 days after fix ships |
| **Medium** | Denial of service, information disclosure without PII, misconfiguration | ≤ 3 business days | ≤ 5 business days | ≤ 30 days | Coordinated, ≤ 30 days after fix ships |
| **Low** | Hardening, defense-in-depth, documentation gaps | ≤ 5 business days | ≤ 10 business days | Next scheduled release | Coordinated with the reporter |

- **Acknowledgement** confirms receipt and assigns a tracking ID; it does not imply a confirmed severity.
- **Initial response / triage** includes a severity assessment, affected components, and a remediation plan.
- **Remediation target** is the goal for a fix merged to `main`; complex fixes may be re-scoped with the reporter and documented in the advisory.
- **Public disclosure** is coordinated with the reporter and published as a GitHub Security Advisory once a fix is available. Reporters may request earlier disclosure; we will not publish before a fix or mitigation is available unless the reporter and maintainers agree.

#### Edge cases and failure states

- **Disputed severity:** If the reporter and maintainers disagree on severity, the higher tier's acknowledgement and response targets apply until consensus is reached. The rationale is recorded in the advisory.
- **Incomplete reports:** Reports missing reproduction steps or affected versions are acknowledged within the tier target and the reporter is asked for the missing details. The triage clock pauses while awaiting the reporter; if no response is received within 14 days, the report is closed as `needs-info` and may be reopened.
- **Third-party dependencies:** Issues in upstream dependencies (Stellar/Soroban, Next.js, Supabase, Pinata, etc.) are triaged by us, then reported upstream. Our remediation target covers applying the upstream fix or a documented mitigation; disclosure follows the upstream advisory timeline.
- **Actively exploited issues:** Any report indicating active exploitation is escalated to Critical regardless of initial tier, and mitigation is prioritized over the standard remediation target.
- **No PII or secrets in reports:** Do not include private keys, credentials, or personal data in reports or advisories. Redact sensitive values and share them only through the private reporting channel.

#### Tracking and verification

- Each report is tracked as a private security advisory with the assigned tier and due dates.
- SLA adherence is reviewed at each security maintainer rotation handoff; breaches are recorded with a root-cause note.
- Fixes ship with regression tests covering the reported failure path before the advisory is published.
