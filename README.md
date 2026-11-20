# innov8

Agricultural escrow platform.

## Local full-stack development guide

This guide provides one reproducible setup for the frontend, backend, mobile app, contracts, Supabase, and tracing. Run the steps in order from a fresh clone.

### Prerequisites

- Node.js 20 LTS and npm 10
- Docker Desktop (for Supabase local stack)
- Rust toolchain with `wasm32-unknown-unknown` target (contracts)
- Expo CLI (`npx expo`) for the mobile app

### 1. Environment configuration

Copy the example env files and fill in local-only values. Never commit real secrets.

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Key local defaults (override in your `.env` files):

| Variable | Purpose | Local default |
| --- | --- | --- |
| `DATABASE_URL` | Backend Postgres connection | `postgresql://postgres:postgres@localhost:54322/postgres` |
| `SUPABASE_URL` | Supabase API endpoint | `http://localhost:54321` |
| `SUPABASE_ANON_KEY` | Public anon key (local only) | printed by `supabase start` |
| `API_PORT` | Backend HTTP port | `3001` |
| `WEB_PORT` | Frontend dev server port | `3000` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Tracing collector | `http://localhost:4318` |

### 2. Supabase

```bash
supabase start
supabase db reset   # applies migrations and seed data
```

`supabase start` prints the local anon/service keys; copy them into your `.env` files. Do not reuse production keys locally.

### 3. Backend

```bash
npm install
npm run --workspace apps/api dev
```

The API listens on `API_PORT` (default `3001`) and exposes a health check at `GET /health`.

### 4. Frontend

```bash
npm run --workspace apps/web dev
```

The web app runs on `WEB_PORT` (default `3000`) and reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` from `apps/web/.env`.

### 5. Mobile

```bash
npm run --workspace apps/mobile start
```

Point the mobile app at your machine's LAN IP (not `localhost`) so a physical device can reach the backend and Supabase.

### 6. Contracts

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cargo test
```

Deploy to the local network only after tests pass; never deploy with production keys from a local shell.

### 7. Tracing

Run an OTLP-compatible collector (for example the Jaeger all-in-one container) and set `OTEL_EXPORTER_OTLP_ENDPOINT` to its HTTP endpoint. If the collector is unreachable, services log a warning and continue serving traffic; tracing is best-effort and must never block requests.

### Troubleshooting

- **Port already in use**: change `API_PORT`/`WEB_PORT` in your `.env` and restart the affected service.
- **Supabase keys missing**: re-run `supabase status` to print local keys.
- **Mobile cannot reach backend**: use the host LAN IP and confirm the firewall allows the API port.
- **Tracing warnings**: verify the collector is running at `OTEL_EXPORTER_OTLP_ENDPOINT`; absence of tracing does not affect functionality.

## Mobile network state action guards

The mobile app must not silently fail or queue unsupported work while the device is offline.

- Network-dependent actions (submitting escrow transactions, syncing, uploading evidence) are **disabled** while offline and surface an inline explanation to the user.
- Only actions explicitly marked as offline-queueable are queued; all other actions are blocked with a clear message until connectivity returns.
- When connectivity is restored, queued work is flushed and any failures are reported without leaking secrets or PII.

See the mobile stack documentation for the list of supported offline-queueable actions.
