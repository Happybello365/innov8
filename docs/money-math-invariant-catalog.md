# Money-Math Invariant Catalog

> **Issue #239** — Shared property-based money-math test library
> Maintained by: Money-math team
> Last updated: 2026-08-30

## Overview

This document catalogs every money-math invariant enforced by the Amana escrow
system. Each invariant is tested in both Rust (on-chain contract) and TypeScript
(off-chain API/frontend) using the shared fixture corpus at
`shared-test-fixtures/money_math_corpus.json`.

The corpus is generated deterministically from seed **42** with **1000 generated
cases** per property, plus boundary exhaustion cases. Both stacks consume the
identical JSON fixture file to guarantee cross-language parity.

---

## Invariant Catalog

### INV-001: Release Funds Conservation

**Category:** Fee calculation
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_release_funds_conservation`)
- Rust parity: `contracts/amana_escrow/tests/parity_money_math.rs`
- TS parity: `shared-test-fixtures/__tests__/money_math_parity.test.ts`

**Invariant:**
```
seller_amount + fee_amount == amount
```

**Description:** When `release_funds()` executes, the total trade amount must
be exactly conserved. The seller receives `amount - fee` and the platform
receives `fee = amount * fee_bps / 10_000`.

**Edge cases covered:**
- `fee_bps = 0` → fee = 0, seller gets all
- `fee_bps = 10_000` → fee = amount, seller gets 0
- `amount = 1` (minimum) at various fee rates
- `amount = i64::MAX` (maximum safe trade value)

---

### INV-002: Fee Amount Non-Negative

**Category:** Fee calculation
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_fee_amount_non_negative`)
- Parity: Same as INV-001

**Invariant:**
```
fee >= 0 for all valid inputs
```

**Description:** The platform fee must never be negative, regardless of the
input amount or fee rate.

---

### INV-003: Fee Amount Does Not Exceed Trade Amount

**Category:** Fee calculation
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_fee_amount_le_amount`)
- Parity: Same as INV-001

**Invariant:**
```
fee <= amount for all valid inputs
```

**Description:** The platform fee must never exceed the total trade amount.

---

### INV-004: Resolve Dispute Conservation

**Category:** Dispute resolution
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_resolve_dispute_conservation`)
- Rust parity: `contracts/amana_escrow/tests/parity_money_math.rs`
- TS parity: `shared-test-fixtures/__tests__/money_math_parity.test.ts`

**Invariant:**
```
seller_net + buyer_refund + fee == total
```

**Description:** When a mediator resolves a dispute, the total trade amount
must be exactly conserved across three destinations: the seller's net payout,
the buyer's refund, and the platform fee.

**Computation chain:**
1. `loss_bps = BPS_DIVISOR - seller_gets_bps`
2. `seller_loss = total * loss_bps * seller_loss_bps / BPS_DIVISOR^2`
3. `seller_raw = total - seller_loss`
4. `buyer_refund = total - seller_raw`
5. `fee = seller_raw * fee_bps / BPS_DIVISOR`
6. `seller_net = seller_raw - fee`

---

### INV-005: Dispute Payouts Non-Negative

**Category:** Dispute resolution
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_resolve_dispute_seller_net_non_negative`, `prop_resolve_dispute_buyer_refund_non_negative`)
- Parity: Same as INV-004

**Invariant:**
```
seller_net >= 0 AND buyer_refund >= 0 AND fee >= 0
```

---

### INV-006: Loss Amount Non-Negative

**Category:** Loss sharing
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_loss_amount_non_negative`)
- Parity: Same as INV-001

**Invariant:**
```
loss >= 0 for all valid inputs
```

---

### INV-007: Loss Amount Does Not Exceed Total

**Category:** Loss sharing
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/bps_fuzz_tests.rs` (`prop_loss_amount_le_total`)
- Parity: Same as INV-001

**Invariant:**
```
loss <= total for all valid inputs
```

---

### INV-008: Clawback Conservation

**Category:** Admin clawback
**Owning test files:**
- Rust parity: `contracts/amana_escrow/tests/parity_money_math.rs`
- TS parity: `shared-test-fixtures/__tests__/money_math_parity.test.ts`
- Additional: `contracts/amana_escrow/tests/clawback_invariant_tests.rs`

**Invariant:**
```
remaining + clawback_amount == trade_amount
```

**Description:** When the admin performs a clawback, the remaining escrowed
amount plus the clawed-back amount must equal the original trade amount.

---

### INV-009: Fund Conservation Across the Escrow Lifecycle

**Category:** Contract solvency
**Owning test files:**
- Rust: `contracts/amana_escrow/src/tests/fund_conservation_tests.rs` (`contract_balance_equals_open_escrow_plus_accrued_fees_across_lifecycle`, `full_admin_cancel_refunds_escrow_and_keeps_invariant`)

**Invariant:**
```
token_balance(contract) == sum(trade.amount for trades in Funded | Delivered | Disputed)
                           + accrued_fees
```

**Description:** Every unit of the settlement token held by the escrow contract
is attributable to exactly one of two buckets: the remaining escrow of an open
trade, or platform fees that have accrued but not yet been withdrawn. Nothing
is held that is unaccounted for, and nothing is accounted for that is not held.
In production the left-hand side can only exceed the right-hand side, by tokens
sent to the contract address outside the contract's entrypoints; a deficit
would mean the contract is insolvent. The test environment has no such
transfers, so the test asserts strict equality.

**How each entrypoint preserves it** (`Δ` is the change to each side):

| Entrypoint | Token balance | Open escrow | Accrued fees |
|---|---|---|---|
| `deposit` | `+amount` | `+amount` | `0` |
| `release_funds` | `-(amount - fee)` | `-amount` | `+fee` |
| `resolve_dispute` | `-(seller_net + buyer_refund)` | `-amount` | `+fee` |
| `admin_clawback` | `-clawback_amount` | `-clawback_amount` | `0` |
| `cancel_trade` (funded) | `-amount` | `-amount` | `0` |
| `withdraw_fees` | `-withdrawn` | `0` | `-withdrawn` |

Each row balances because of INV-001 (`seller_amount + fee == amount`),
INV-004 (`seller_net + buyer_refund + fee == total`) and INV-008
(`remaining + clawback == trade_amount`).

**Related rules a reviewer should check against `lib.rs`:**
- A trade in `Created`, `Completed` or `Cancelled` holds no escrow, so it
  contributes `0` to the sum. Every path that moves a trade into `Completed`
  or `Cancelled` must transfer out or accrue its whole remaining amount first.
- `AccruedFees` only increases inside `release_funds` and the dispute
  settlement, and only decreases inside `withdraw_fees`.
- `withdraw_fees` must never withdraw more than the stored `AccruedFees`,
  regardless of fee-rate updates between accrual and withdrawal.
- A fee-rate change (`update_fee_bps`) never rewrites `AccruedFees`; it only
  changes the fee computed by later settlements.

---

## Cross-Language Parity Testing

### How it works

1. **Generate:** `shared-test-fixtures/generate-corpus.js --seed 42 --cases 1000`
   produces `shared-test-fixtures/money_math_corpus.json`

2. **Rust consumption:** `contracts/amana_escrow/tests/parity_money_math.rs`
   deserializes the JSON with `serde_json` and runs each fixture through the
   Rust `checked_fee_amount` / `checked_loss_amount` replicas.

3. **TypeScript consumption:** `shared-test-fixtures/__tests__/money_math_parity.test.ts`
   loads the same JSON and runs each fixture through the TypeScript
   `checkedFeeAmount` / `checkedLossAmount` implementations.

4. **Parity guarantee:** Both stacks compute the same functions on the same
   inputs and assert the same expected outputs. Any divergence in arithmetic
   between Rust and TypeScript will surface as a test failure.

### Regenerating the corpus

```bash
# From the repo root
node shared-test-fixtures/generate-corpus.js --seed 42 --cases 1000

# Verify both stacks pass
cd contracts/amana_escrow && cargo test parity_money_math
cd shared-test-fixtures && npx jest money_math_parity
```

### Adding new invariants

1. Add the invariant formula to the `invariants` array in the generator
2. Add corresponding fixture generation in `generate-corpus.js`
3. Add a test case in both `parity_money_math.rs` and `money_math_parity.test.ts`
4. Update this catalog with the new INV-XXX entry
5. Run both test suites to confirm parity

---

## CI Integration

The cross-language parity job runs in `.github/workflows/money-math-parity.yml`:

- Generates the corpus with the pinned seed
- Runs Rust `cargo test parity_money_math`
- Runs TypeScript `jest money_math_parity`
- Fails if either stack diverges from the expected corpus values
