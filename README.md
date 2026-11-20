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

## ⚖️ Dispute Participant Evidence Guide

This guide explains what evidence buyers, sellers, and drivers may submit when a trade is disputed, the accepted formats, and how to submit it. It is documentation only and does not change application, contract, or configuration behavior. Mediators review submitted evidence against the agreed `Loss_Ratio` and the trade manifest before settlement.

### 1. Who submits what

**Buyers** may submit:

- Proof-of-Delivery (PoD) video showing the goods on arrival, including any damage, shortage, or spoilage.
- Photos of the delivered goods, packaging, and seals.
- The delivery note or waybill signed at handover.
- A short written statement describing the issue and the expected outcome.

**Sellers** may submit:

- Dispatch photos or video showing goods and packaging in good condition before loading.
- The vehicle manifest (driver name, phone number, plate number) recorded at dispatch.
- Weight, grade, or quality records captured at loading.
- A short written statement describing the dispatch conditions and any agreed handling instructions.

**Drivers** may submit:

- Photos or video of the vehicle, cargo, and seals at pickup and at delivery.
- Transit notes covering delays, accidents, theft, or route changes.
- Handover confirmation showing who received the goods and when.
- A short written statement describing what happened during transit.

Only submit evidence for trades you are a party to. Do not submit evidence on behalf of another participant.

### 2. Accepted formats

- **Video:** MP4 or MOV, kept as short as possible while still showing the relevant goods and context.
- **Images:** JPG or PNG, clear and in focus.
- **Documents:** PDF for delivery notes, waybills, and manifests.
- **Text:** A plain written statement in the dispute form.

Video and image evidence is stored on IPFS via Pinata; only the resulting content reference and trade metadata are kept off-chain. Keep each file reasonably sized so uploads complete on field connections.

### 3. How to submit

1. Open the disputed trade in the frontend or mobile app.
2. Select **Submit evidence** on the dispute.
3. Choose the evidence type (video, image, document, or statement).
4. Upload the file or enter your written statement.
5. Confirm the submission and wait for the upload to finish before closing the app.
6. Record the confirmation shown after upload; share it with the pilot coordinator if you need support.

Submit evidence as soon as the issue is identified and before the dispute review closes. Late evidence may not be considered.

### 4. Edge cases and failure states

- **Upload fails or times out:** retry on a stable connection. If it keeps failing, contact the pilot coordinator and keep the original file.
- **Wrong file uploaded:** submit a corrected file and note in your statement which submission it replaces.
- **Dispute already resolved:** new evidence cannot change a settled trade; raise the concern with the pilot coordinator.
- **No video available:** photos, documents, and a written statement are still accepted.
- **File too large or unsupported format:** convert to an accepted format above before retrying.

### 5. Privacy and safety

- Do not include recovery phrases, private keys, passwords, API tokens, or wallet secrets in any evidence or statement.
- Avoid capturing unrelated people, personal phone numbers, or home addresses; blur or crop where possible.
- Share only the minimum personal data needed to describe the dispute.
- Report suspected secret exposure per [SECURITY.md](./SECURITY.md).
