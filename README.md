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

For step-by-step testnet wallet creation, funding, network selection, and reset procedures, see the [Stellar Testnet Pilot Wallet Guide](./docs/stellar-testnet-pilot-wallet.md).

---

## ⚖️ Mediator Decision-Making Guide

This guide describes how mediators review disputes, handle conflicts of interest, escalate, and protect privacy. It is documentation only and does not change application, contract, or configuration behavior. Mediators act on the existing dispute workflow in the Mediator dashboard; the smart contract enforces the final settlement distribution.

### 1. Evidence Review

When a dispute is opened, the buyer and seller may submit evidence (for example, Proof-of-Delivery video stored on IPFS, driver manifest logs, and trade metadata). Mediators should:

- Confirm the trade is in the `Dispute` state and that the agreed `Loss_Ratio` is visible before reviewing evidence.
- Review all submitted evidence for both parties, not just the first submission.
- Verify that video evidence hashes match the IPFS references recorded for the trade; treat unverifiable or mismatched evidence as unconfirmed.
- Cross-check the driver manifest (driver name, phone, vehicle) against the trade record.
- Record the evidence considered and the reasoning in the dispute notes so the decision is auditable.
- Give both parties a reasonable window to respond before deciding; do not decide on one-sided evidence unless a party fails to respond within the stated window.

### 2. Conflict Handling

- A mediator must decline any dispute where they have a personal, financial, or family relationship with either party, the driver, or the goods involved.
- A mediator must not mediate a dispute for a trade they initiated, funded, or are otherwise party to.
- If a conflict is discovered after review begins, the mediator must stop, disclose the conflict to the innov8 team, and hand the dispute to another mediator.
- Mediators must not accept gifts, payments, or favors from either party in exchange for a favorable outcome.
- Decisions must be based only on the evidence and the agreed `Loss_Ratio`, not on the parties' reputation scores alone.

### 3. Escalation

Escalate a dispute to the innov8 team when any of the following applies:

- Evidence is missing, contradictory, or cannot be verified against IPFS references.
- The parties allege fraud, theft, or threats, or the situation appears unsafe.
- The dispute involves amounts or patterns that suggest abuse of the pilot.
- A conflict of interest cannot be resolved by reassignment.
- A technical failure (for example, an unreadable video or a failed settlement transaction) blocks a decision.

When escalating, share only the trade identifier, the dispute state, and the evidence references needed to act. Do not paste recovery phrases, private keys, or full personal contact details into escalation channels.

### 4. Privacy Expectations

- Access evidence only for disputes assigned to you; do not browse unrelated trades.
- Do not download, copy, or redistribute evidence outside the dispute workflow.
- Do not share parties' personal data (names, phone numbers, addresses, wallet recovery material) with third parties.
- Redact personal data from dispute notes and escalation messages where it is not needed to decide the dispute.
- Report any suspected data exposure or secret leak per [SECURITY.md](./SECURITY.md).

### 5. Failure States

- If evidence cannot be loaded, do not guess the outcome; escalate and leave the dispute open.
- If a settlement transaction fails, do not retry with altered parameters; escalate so the innov8 team can investigate.
- If a party stops responding, document the attempts and the response window before deciding.

---
