# ADR-006: Staged Releases Tranche Model

## Status

Accepted (implemented in `contracts/amana_escrow/src/lib.rs` under Issue #289).

## Context

In standard escrow trades, `release_funds` releases the entire remaining trade balance in a single execution upon delivery confirmation. However, pilot agricultural and commercial trade partners require milestone-based or staged releases — for example:
- 50% payout upon delivery confirmation,
- 50% payout after an agreed inspection and quality assurance window.

Requiring multiple distinct escrow contracts for each tranche introduces friction, fee duplication, and fragmented trade tracking. At the same time, any tranche mechanism must:
1. Ensure conservation of funds: all tranches must sum exactly to the original trade amount.
2. Maintain compatibility with the stream-accounting bookkeeping (`get_claimed_amount` and `get_stream_accounting`).
3. Leave existing single-release trades unaffected.
4. Gate the capability behind an admin-controlled feature flag (`StagedReleaseEnabled`) for safe pilot rollouts.

## Decision

1. **Tranche Data Model**:
   Staged trades store an ordered sequence of release tranches under `DataKey::TradeTranches(u64)`:
   ```rust
   #[contracttype]
   #[derive(Clone, Debug, PartialEq, Eq)]
   pub struct ReleaseTranche {
       pub amount: i128,
       pub released: bool,
   }
   ```
   Stored in persistent storage and bumped with the trade lifecycle. Existing trades without tranches have no stored entry under this key and follow the legacy single-release path unmodified.

2. **Sum-to-Amount Invariant**:
   When configuring tranches (via `create_staged_trade` or `set_trade_tranches`), every tranche amount must be positive (`> 0`), and the sum of all tranche amounts must equal `trade.amount` exactly:
   ```rust
   assert!(sum == amount, "tranches must sum exactly to trade amount");
   ```

3. **Stream-Accounting Integration**:
   `get_claimed_amount(env, trade_id)` is updated to inspect `DataKey::TradeTranches(trade_id)`:
   - For staged trades, it dynamically sums the amounts of all released tranches (`t.released == true`), adjusting for any prior clawbacks: `claimed.saturating_sub(clawed_back)`.
   - For non-staged trades, it maintains the existing behavior: returning `original_amount.saturating_sub(clawed_back)` if `Completed`, or `0` otherwise.
   `get_stream_accounting` automatically reflects `(original_amount, claimed_amount, clawback_total)` throughout each release stage.

4. **Lifecycle & State Transitions**:
   - Intermediate tranche releases disburse the tranche amount (minus pro-rata fee) to the seller, mark the tranche as released, and record a `"released"` trade event. The trade remains in `TradeStatus::Delivered` so subsequent tranches can be released.
   - When the final tranche is released, the trade transitions to `TradeStatus::Completed` and records completion timestamps in `ReleaseSequence`.

5. **Feature Flag Gating**:
   Staged trade creation is guarded by `is_staged_release_enabled(&env)`. The contract admin controls this via `set_staged_release_enabled(&admin, enabled)` with instance TTL extension. If disabled, attempts to create staged trades are rejected with `"staged release feature is disabled"`.

## Consequences

- **Positive**: Enables flexible staged milestone payments (e.g. delivery + inspection window) within a single trade lifecycle.
- **Positive**: Existing single-release trades and callers continue to operate identically with zero regression.
- **Positive**: Stream accounting provides accurate, transparent on-chain visibility into claimed vs escrowed balances at every intermediate phase.
