# Savings & Goals Endpoints

All goals endpoints require `Authorization: Bearer <token>` (see
[overview.md](./overview.md#authentication)).
Responses follow the [error envelope](./errors.md) on failure.

## Goal lifecycle

A goal is created on-chain and tracked off-chain as the vault it is linked to
accumulates deposits. The server correlates the live Soroban vault balance with
goal progression on every request rather than caching a snapshot.

```
ACTIVE -> COMPLETED   (target amount reached)
       -> CANCELLED   (owner or admin cancels before target is reached)
```

Goals are not created or cancelled through this API — those transitions are
driven by on-chain events and processed by the backend event listener. This
endpoint is **read-only**: it surfaces analytics computed from the current
on-chain state.

## Get goal analytics

`GET /goals`

Returns an aggregated analytics snapshot for every savings goal owned by the
authenticated wallet, including per-goal progression metrics and portfolio-level
totals.

No query parameters are accepted. There is no pagination — all goals for the
wallet are returned in a single response.

**Response `200`**

```json
{
  "walletAddress": "gaaa...whf",
  "totalGoals": 3,
  "activeGoals": 2,
  "completedGoals": 1,
  "totalTargetAmount": "3000000000",
  "totalCurrentAmount": "1250000000",
  "overallProgressPercentage": 41,
  "goals": [
    {
      "goalId": "goal-abc123",
      "targetAmountUsdc": "1000000000",
      "currentAmountUsdc": "1000000000",
      "percentageComplete": 100,
      "daysRemaining": 0,
      "deadline": "2026-06-01T00:00:00.000Z",
      "status": "COMPLETED",
      "vaultBalance": "1000000000",
      "isOnTrack": true
    },
    {
      "goalId": "goal-def456",
      "targetAmountUsdc": "1500000000",
      "currentAmountUsdc": "750000000",
      "percentageComplete": 50,
      "daysRemaining": 45,
      "deadline": "2026-12-01T00:00:00.000Z",
      "status": "ACTIVE",
      "vaultBalance": "750000000",
      "isOnTrack": true
    },
    {
      "goalId": "goal-ghi789",
      "targetAmountUsdc": "500000000",
      "currentAmountUsdc": "0",
      "percentageComplete": 0,
      "daysRemaining": 12,
      "deadline": "2026-10-30T00:00:00.000Z",
      "status": "ACTIVE",
      "vaultBalance": "0",
      "isOnTrack": false
    }
  ],
  "timestamp": "2026-10-18T09:42:14.398Z"
}
```

### Response fields

**Top-level fields**

| Field | Type | Description |
|---|---|---|
| `walletAddress` | string | Lowercase Stellar public key of the authenticated wallet |
| `totalGoals` | integer | Total number of goals across all statuses |
| `activeGoals` | integer | Count of goals with status `ACTIVE` |
| `completedGoals` | integer | Count of goals with status `COMPLETED` |
| `totalTargetAmount` | string | Sum of all `targetAmountUsdc` values as a BigInt string |
| `totalCurrentAmount` | string | Sum of all `currentAmountUsdc` values as a BigInt string |
| `overallProgressPercentage` | integer | `totalCurrentAmount / totalTargetAmount * 100`, floored to an integer |
| `goals` | array | Per-goal analytics objects (see below) |
| `timestamp` | string | ISO 8601 timestamp of when the response was computed |

**Per-goal fields (`goals[]`)**

| Field | Type | Description |
|---|---|---|
| `goalId` | string | Stable on-chain goal identifier |
| `targetAmountUsdc` | string | Target savings amount as a BigInt string |
| `currentAmountUsdc` | string | Amount saved so far as a BigInt string |
| `percentageComplete` | integer | `currentAmountUsdc / targetAmountUsdc * 100`, floored to an integer |
| `daysRemaining` | integer | Calendar days until `deadline`; `0` once the deadline has passed |
| `deadline` | string | ISO 8601 deadline set when the goal was created |
| `status` | string | One of `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `vaultBalance` | string | Current balance of the linked Soroban vault as a BigInt string |
| `isOnTrack` | boolean | `true` when progress is at least 90 % of the expected linear pace |

### Amount encoding

All USDC amounts (`targetAmountUsdc`, `currentAmountUsdc`, `vaultBalance`,
`totalTargetAmount`, `totalCurrentAmount`) are **BigInt strings** — base-10
integer strings that represent the raw on-chain value without any decimal
point. Do not parse them with `parseFloat`; use a BigInt-aware library or
integer arithmetic for any money calculations on the client side.

### `isOnTrack` calculation

The server computes expected linear progress as:

```
expectedProgressPct = (elapsed_days / total_days) * 100
isOnTrack = percentageComplete >= expectedProgressPct * 0.9
```

A 10 % buffer is applied, so a goal is only flagged as behind when actual
progress falls more than 10 percentage points below the expected pace.

### Status codes

| Status | Meaning |
|---|---|
| `200` | Success — analytics returned |
| `401` | Missing or invalid bearer token — see [AUTH_ERROR](./errors.md#auth_error) |
| `404` | No user record found for the wallet address in the bearer token |
| `500` | Unexpected server error — see [INTERNAL_ERROR](./errors.md) |

### Example request

```bash
curl http://localhost:4000/goals \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

### `401` response (missing or invalid token)

```json
{ "error": "Unauthorized" }
```

The goals route returns the legacy `{ "error": ... }` envelope for auth
failures (consistent with the auth middleware). All other errors use the
[structured envelope](./errors.md#envelope-shapes).

### `500` response (unhandled error)

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Internal server error",
  "timestamp": "2026-10-18T09:42:14.398Z",
  "path": "/goals",
  "requestId": "req_abc123"
}
```

Include `requestId` (and `correlationId` if present) when reporting an issue.
