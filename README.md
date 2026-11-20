# innov8

Agricultural escrow platform for fair, transparent settlement between farmers, buyers, and logistics partners.

## Path payments (NGN to cNGN)

A path payment lets a buyer pay in NGN while the farmer receives cNGN, without either side holding the other currency. In plain language:

1. The buyer sends NGN into escrow.
2. The platform converts NGN to cNGN along a quoted path (one or more hops).
3. The farmer is paid in cNGN once delivery is confirmed.

If no path can convert the amount, the payment fails and the buyer's NGN stays in escrow unchanged.

### Slippage

Slippage is the gap between the quoted rate and the rate actually received. Prices move between quote and settlement, so the farmer may get slightly less cNGN than quoted. You set a maximum slippage (for example 1%). If the real rate would exceed it, the payment is rejected instead of silently short-changing the farmer. A tighter limit means fewer surprises but more retries; a looser limit means fewer retries but more variance.

### Fees

Path payments carry two costs, both shown before you confirm:

- **Conversion fee** — charged on the converted amount, not on the loss portion of a partial delivery.
- **Network fee** — a small fixed cost per hop for moving funds on-chain.

Fees are rounded once at final settlement (round-half-up) so they never compound. A zero conversion fee is valid. Fee rates outside `[0, 1]` are rejected as invalid configuration.

### Retries and failure states

A path payment is retried only when the failure is transient (for example, a quote that expired or a temporary network error). Each retry re-quotes and re-checks your slippage limit; it never reuses a stale rate.

| Condition | Outcome |
| --- | --- |
| No conversion path available | Rejected, escrow unchanged |
| Slippage exceeds your limit | Rejected, escrow unchanged |
| Quote expired | Retried with a fresh quote |
| Temporary network error | Retried with backoff |
| Fee rate outside `[0, 1]` | Rejected as invalid configuration |
| Amount `0` or negative | Rejected |

Rejected or exhausted retries leave escrow untouched and emit no partial payouts. Error messages never include party identifiers or amounts beyond what the caller already supplied.

## Loss-sharing examples workbook

This workbook documents worked examples for loss ratios, rounding, fees, and partial delivery outcomes. All figures are illustrative and use whole currency units unless stated otherwise. No real account, party, or personal data is used in these examples.

### 1. Loss ratio

Loss ratio = `total_loss / total_escrowed_value`.

| Escrowed value | Loss | Loss ratio |
| --- | --- | --- |
| 10,000 | 1,000 | 0.10 (10%) |
| 10,000 | 2,500 | 0.25 (25%) |
| 10,000 | 0 | 0.00 (0%) |
| 10,000 | 10,000 | 1.00 (100%) |

Edge cases:

- Escrowed value of `0` is invalid input; the ratio is undefined and the settlement must be rejected rather than divided by zero.
- Loss greater than escrowed value is rejected as invalid input.
- A loss ratio of `1.00` means the full escrow is consumed by loss; fees are not charged on top of the loss.

### 2. Rounding

Amounts are rounded to the nearest whole unit, with half values rounded up (round-half-up). Rounding is applied once, at the final settlement step, to avoid compounding drift.

| Raw amount | Rounded |
| --- | --- |
| 100.4 | 100 |
| 100.5 | 101 |
| 100.49 | 100 |
| 0.5 | 1 |

Edge cases:

- Negative amounts are not expected in settlement output; if produced, they indicate a bug and must fail validation.
- Rounding must never cause the sum of payouts to exceed the escrowed value; any residual unit is assigned to the platform fee bucket, not duplicated.

### 3. Fees

Fee = `escrowed_value * fee_rate`, rounded per the rules above. Fees are charged on the delivered value, not on the loss.

| Escrowed value | Fee rate | Fee |
| --- | --- | --- |
| 10,000 | 0.01 | 100 |
| 10,000 | 0.025 | 250 |
| 10,000 | 0.00 | 0 |

Edge cases:

- Fee rate outside `[0, 1]` is rejected as invalid configuration.
- A zero fee rate is valid and produces a zero fee.
- Fees are never charged on the loss portion of a partial delivery.

### 4. Partial delivery outcomes

When only part of a delivery is fulfilled, the escrow splits into delivered value, loss, and fee.

Example: escrowed value `10,000`, delivered `6,000`, loss `4,000`, fee rate `0.01`.

| Bucket | Calculation | Amount |
| --- | --- | --- |
| Delivered value | given | 6,000 |
| Loss | given | 4,000 |
| Fee | 6,000 * 0.01 | 60 |
| Farmer payout | 6,000 - 60 | 5,940 |
| Buyer refund | 4,000 | 4,000 |

Edge cases:

- Delivered `0` (total loss): farmer payout `0`, fee `0`, buyer refund equals escrowed value.
- Delivered equals escrowed value (full delivery): loss `0`, fee charged on full value, buyer refund `0`.
- Delivered plus loss must equal escrowed value; any mismatch fails validation before settlement.
- Failure states (invalid inputs, mismatched totals, out-of-range fee rates) must reject the settlement and leave escrow unchanged; no partial payouts are emitted.

### 5. Failure states summary

| Condition | Outcome |
| --- | --- |
| Escrowed value `0` | Rejected |
| Loss > escrowed value | Rejected |
| Fee rate outside `[0, 1]` | Rejected |
| Delivered + loss != escrowed value | Rejected |
| Negative payout | Rejected |

Rejected settlements must not leak party identifiers or amounts in error messages beyond what the caller already supplied.
