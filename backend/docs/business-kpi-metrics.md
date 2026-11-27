# Business KPI Metrics Catalog

> Addresses issue #232 — product funnel analytics instrumentation.

## Overview

The backend exposes two classes of metrics via the OTel → Prometheus pipeline
(scraped on `PROMETHEUS_PORT`, default **9464**):

1. **Infrastructure / Stellar metrics** — already defined in `lib/metrics.ts`
   (Stellar RPC call latency, transaction outcomes, reconciliation drift, etc.)
2. **Product-funnel / KPI metrics** (this document) — cardinality-safe counters
   and histograms covering the escrow trade lifecycle so leadership, on-call,
   and roadmap decisions have quantitative product health visibility.

---

## Metric Catalog

### `amana_trades_total{event}`

| Label value | Triggered by | Source |
|---|---|---|
| `created` | `TradeService.createPendingTrade()` (DB-side), also `handleTradeCreated` (on-chain confirm) | `trade.service.ts`, `eventHandlers.ts` |
| `funded` | `handleTradeFunded` on-chain event | `eventHandlers.ts` |
| `delivered` | `handleDeliveryConfirmed` on-chain event | `eventHandlers.ts` |
| `released` | `handleFundsReleased` on-chain event | `eventHandlers.ts` |
| `disputed` | `handleDisputeInitiated` on-chain event | `eventHandlers.ts` |
| `expired` | `TradeExpiryService.sweepExpiredTrades()` | `tradeExpiry.service.ts` |
| `cancelled` | (reserved for manual cancellation) | — |
| `refunded` | (reserved for explicit on-chain refund confirmation) | — |

**Funnel**: `created → funded → delivered → released` (success path)  
**Failure paths**: `created → expired`, `funded → disputed`

**Prometheus recording rule** (add to your `rules.yml`):
```yaml
# Dispute rate over trailing 1-hour window
- record: job:amana_dispute_rate:1h
  expr: |
    rate(amana_trades_total{event="disputed"}[1h])
    /
    rate(amana_trades_total{event="funded"}[1h])
```

**Dispute-spike alert** (Alertmanager):
```yaml
- alert: TradeDisputeRateSpike
  expr: job:amana_dispute_rate:1h > 0.10   # >10% dispute rate
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Dispute rate >10% over the last hour"
    runbook: "docs/runbooks/dispute-spike.md"
```

---

### `amana_trade_time_to_fund_ms` (Histogram)

Time from a trade entering `CREATED` status to becoming `FUNDED`, in
milliseconds. Useful for tracking how quickly buyers fund their escrow after
creating a trade.

**Labels**: none (single dimension; add `network` if you run multi-network).

**Suggested SLO**: p95 < 120 000 ms (2 minutes).

---

### `amana_trade_time_to_release_ms{outcome}` (Histogram)

Time from escrow `FUNDED` to final settlement, in milliseconds.

| `outcome` label | Meaning |
|---|---|
| `released` | Funds released to seller — happy path |
| `refunded` | Funds returned to buyer — expired or dispute resolved for buyer |

**Suggested SLO**: p50 < 3 600 000 ms (1 hour), p95 < 86 400 000 ms (24 hours).

**Dashboard panel**: plot both `outcome` streams together to visualise
settlement speed split by resolution type.

---

### `amana_trade_gmv_usdc_cents` (Histogram)

Gross merchandise value per completed/released trade, expressed in **USDC
cents** (amount × 100, integer). Using cents keeps histogram bucket arithmetic
integer-safe while preserving sub-dollar precision.

**Labels**: `outcome` (same values as `time_to_release`).

**To get total GMV in USD**:
```promql
sum(increase(amana_trade_gmv_usdc_cents_sum[24h])) / 100
```

This is a *proxy* metric — it reflects the value of trades that completed
their on-chain release, which may lag the wall-clock business day. Use it
alongside `amana_trades_total{event="released"}` for a daily count + volume
report.

---

### `amana_dispute_rate_anomalies_total{outcome}` (Counter)

Incremented each time the application-level dispute-rate check detects an
anomaly (i.e., the rolling dispute rate exceeds a threshold). This is the
*detection event* counter — the actual rate calculation lives in a Prometheus
recording rule above. Pair with an Alertmanager rule to page on consecutive
detections.

---

## Cardinality Notes

All labels are **low-cardinality by design** — `event` has 8 fixed values,
`outcome` has 2. Never add `tradeId`, `buyerAddress`, or any per-entity
identifier as a label — those would explode the time-series cardinality and
make your Prometheus expensive to run. Keep entity-level detail in structured
logs instead.

---

## Loss-Sharing Worked Examples

> Addresses issue #549 — worked examples for loss ratios, rounding, fees, and
> partial delivery outcomes. All figures are illustrative and use integer
> USDC cents (1 USDC = 100 cents) to mirror `amana_trade_gmv_usdc_cents`.
> No real addresses, trade IDs, or PII appear in these examples.

### Conventions

- Amounts are integer **USDC cents**; `100` = 1.00 USDC.
- Fee basis points (`bps`) are applied as `amount * bps / 10_000`.
- Rounding is **half-up** on the fee, then the remainder goes to the
  counterparty so the split always sums back to the original amount.
- A **loss** is any shortfall between the escrowed amount and the amount
  actually recoverable (partial delivery, dispute split, or expiry refund).

### Example 1 — Loss ratio on a partial delivery

Escrow of **1 000.00 USDC** (`100000` cents). Seller delivers only 60% of the
agreed quantity; the buyer accepts the partial delivery.

| Step | Computation | Cents |
|---|---|---|
| Escrowed | — | `100000` |
| Delivered value (60%) | `100000 * 6000 / 10000` | `60000` |
| Loss (undelivered) | `100000 - 60000` | `40000` |
| Loss ratio | `40000 / 100000` | `0.40` (40%) |

Loss ratio is reported as a fraction of escrow, so it maps directly onto the
`amana_trade_gmv_usdc_cents` histogram (loss = escrow − released value).

### Example 2 — Fee rounding (half-up)

Platform fee of **250 bps (2.5%)** on a released amount of `33333` cents.

| Step | Computation | Cents |
|---|---|---|
| Raw fee | `33333 * 250 / 10000` = `833.325` | — |
| Rounded fee (half-up) | `round(833.325)` | `833` |
| Seller payout | `33333 - 833` | `32500` |

Edge case: when the raw fee lands exactly on `.5` (e.g. `amount = 200`,
`bps = 250` → `5.0`), half-up rounds **up** to `5`. The seller payout is
`amount - fee`, so the split always reconciles to the escrowed total — never
emit a fee that exceeds the amount.

### Example 3 — Dispute split with fees

Escrow `50000` cents, dispute resolved **70% buyer / 30% seller**. A 250 bps
fee applies only to the seller's released portion.

| Step | Computation | Cents |
|---|---|---|
| Buyer refund (70%) | `50000 * 7000 / 10000` | `35000` |
| Seller gross (30%) | `50000 - 35000` | `15000` |
| Fee on seller gross | `round(15000 * 250 / 10000)` = `round(375)` | `375` |
| Seller net | `15000 - 375` | `14625` |
| Total out | `35000 + 14625 + 375` | `50000` ✓ |

### Example 4 — Expiry refund (full loss to seller)

Escrow `80000` cents expires before delivery. Buyer is refunded in full; the
seller receives nothing and no fee is charged.

| Step | Computation | Cents |
|---|---|---|
| Buyer refund | `80000` | `80000` |
| Seller payout | — | `0` |
| Fee | — | `0` |
| Loss ratio (seller) | `80000 / 80000` | `1.00` (100%) |

This is recorded under `amana_trade_time_to_release_ms{outcome="refunded"}`
and `amana_trades_total{event="expired"}`.

### Failure states to handle

- **Zero / negative amount** — reject before any fee math; never divide by a
  zero escrow when computing loss ratio.
- **`bps` out of range** — clamp or reject `bps > 10000` so the fee can never
  exceed the amount.
- **Rounding drift** — always derive the counterparty share as
  `amount - fee` (not an independent rounded value) so the split sums exactly.
- **Partial delivery below threshold** — if delivered value is `0`, treat as a
  full loss and route to the expiry/dispute path rather than releasing funds.

---

## Verifying metrics in staging

1. Start the backend with `PROMETHEUS_PORT=9464`.
2. `curl http://localhost:9464/metrics | grep amana_trades`
3. Create, fund, and release a trade through the API.
4. Re-curl; counters should have incremented.

For the time-based histograms, look for `amana_trade_time_to_fund_ms_bucket`
and `amana_trade_time_to_release_ms_bucket` lines.

---

## Implementation files

| File | Role |
|---|---|
| `src/lib/metrics.ts` | Metric definitions and `record*` functions |
| `src/services/eventHandlers.ts` | Wires funnel counters + GMV to on-chain events |
| `src/services/trade.service.ts` | Wires `created` counter to DB-side creation |
| `src/services/tradeExpiry.service.ts` | Wires `expired` counter to the sweeper |
