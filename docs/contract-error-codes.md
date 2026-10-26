# Contract Error Codes

This document lists all structured error codes emitted by the Amana Escrow
smart contract. The contract uses deterministic panic message strings so the
backend can parse and classify failures without relying on opaque numeric codes.

---

## Admin Clawback Error Codes (Issue #97)

These codes are emitted when `admin_clawback(trade_id, amount, admin)` is called
with invalid arguments or in an invalid contract state. The code is embedded
verbatim in the Soroban panic message, e.g.:

```
WasmVm error: CLAWBACK_UNAUTHORIZED
```

### Code Reference

| Error Code                     | HTTP Status | Description                                                           |
|--------------------------------|-------------|-----------------------------------------------------------------------|
| `CLAWBACK_UNAUTHORIZED`         | 403         | Caller is not the registered contract admin.                          |
| `CLAWBACK_STREAM_NOT_FOUND`     | 404         | No escrow trade record found for the given `trade_id`.                |
| `CLAWBACK_INVALID_AMOUNT`       | 400         | Requested clawback amount is zero or negative.                        |
| `CLAWBACK_INSUFFICIENT_VESTED`  | 422         | Requested amount exceeds the currently escrowed (vested) balance.     |
| `CLAWBACK_INVALID_STATUS`       | 409         | Trade is not in `Funded` status (already Completed, Cancelled, etc.). |

### Backend Mapping

The service `backend/src/services/contractClawbackError.service.ts` maps these
strings to structured `AppError` instances:

```typescript
import { mapContractClawbackError } from "../services/contractClawbackError.service";

try {
  await sorobanRpc.invoke("admin_clawback", [tradeId, amount, adminAddress]);
} catch (err) {
  throw mapContractClawbackError(err, { tradeId, adminAddress });
}
```

The corresponding `ErrorCode` enum values (in `backend/src/errors/errorCodes.ts`):

| Contract string                | `ErrorCode` enum value                     |
|--------------------------------|--------------------------------------------|
| `CLAWBACK_UNAUTHORIZED`         | `ErrorCode.CLAWBACK_UNAUTHORIZED`           |
| `CLAWBACK_STREAM_NOT_FOUND`     | `ErrorCode.CLAWBACK_STREAM_NOT_FOUND`       |
| `CLAWBACK_INVALID_AMOUNT`       | `ErrorCode.CLAWBACK_INVALID_AMOUNT`         |
| `CLAWBACK_INSUFFICIENT_VESTED`  | `ErrorCode.CLAWBACK_INSUFFICIENT_VESTED`    |
| `CLAWBACK_INVALID_STATUS`       | `ErrorCode.CLAWBACK_INVALID_STATUS`         |

---

## Timelock Error Codes (Issue #189)

Emitted by the timelock queue/execute flow (`pub mod timelock_errors`).

| Error Code                | Description                                                    |
|---------------------------|----------------------------------------------------------------|
| `TIMELOCK_UNAUTHORIZED`   | Caller is not authorised to queue, execute or cancel the operation. |
| `TIMELOCK_NOT_READY`      | The operation's `execute_after` time has not been reached.     |
| `TIMELOCK_OP_NOT_FOUND`   | No queued operation exists for the given operation ID.         |
| `TIMELOCK_INVALID_OP`     | The queued operation payload is not valid for this action.     |

---

## Fee Withdrawal Error Codes (Issue #5)

Emitted by `withdraw_fees` (`pub mod fee_errors`).

| Error Code                      | Description                                                              |
|---------------------------------|--------------------------------------------------------------------------|
| `FEES_DESTINATION_IS_CONTRACT`  | Withdrawal destination is the escrow contract itself.                    |

---

## Source of Truth

| Artifact                                                   | Purpose                                 |
|------------------------------------------------------------|-----------------------------------------|
| `contracts/amana_escrow/src/lib.rs` → `pub mod clawback_errors` | Canonical string constants on-chain |
| `backend/src/errors/errorCodes.ts` → `enum ErrorCode`     | Backend enum values                     |
| `backend/src/services/contractClawbackError.service.ts`   | Mapping logic + user-facing messages    |
| `contracts/amana_escrow/tests/clawback_error_tests.rs`    | On-chain test assertions                |
| `contracts/amana_escrow/tests/error_docs_sync_tests.rs`   | Fails `cargo test` if this table drifts from `lib.rs` |

These sources **must remain in sync**. If a new error code is added on-chain,
add the `ErrorCode` entry and a mapping case in the service.

---

## Adding New Error Codes

1. Add the constant to `pub mod clawback_errors` in `lib.rs`.
2. Use `panic!("{}", clawback_errors::YOUR_CODE)` in the contract.
3. Add `ErrorCode.YOUR_CODE` to `backend/src/errors/errorCodes.ts`.
4. Add a `case` branch in `mapClawbackErrorCode()` in `contractClawbackError.service.ts`.
5. Add a `#[should_panic(expected = "YOUR_CODE")]` test in `clawback_error_tests.rs`.
6. Update this document.
