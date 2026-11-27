# Admin Clawback Function Specification

Implements emergency clawback helper for administrative asset recovery.

## Interaction with an in-flight dispute

`admin_clawback` and the timelocked `queue_clawback` / `execute_clawback`
pair are **allowed** on a `Disputed` trade. Eligibility (`Funded` or
`Disputed`) is enforced when the clawback is executed, not when it is queued.

| Situation | Result |
|-----------|--------|
| Partial clawback while `Disputed` | Trade stays `Disputed` on the reduced `amount`; the mediator can still `resolve_dispute`, which distributes only the remaining escrow. |
| Full clawback while `Disputed` | Trade becomes `Cancelled` with `amount == 0`; the dispute is closed and `resolve_dispute` is rejected afterwards. |
| Clawback queued while `Funded`, trade disputed before execution | Executes against the `Disputed` trade as above. |
| Clawback queued, trade resolved (`Completed`) before execution | `execute_clawback` is rejected with "Trade must be in Funded or Disputed status for clawback"; nothing is transferred and the operation stays unexecuted. |

These rules are enforced by `execute_clawback` / `admin_clawback` in
`contracts/amana_escrow/src/lib.rs` and covered by the tests in
`contracts/amana_escrow/tests/partial_clawback_tests.rs`.
