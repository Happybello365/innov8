# innov8

Agricultural escrow platform for fair, transparent settlement between farmers, buyers, and logistics partners.

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
