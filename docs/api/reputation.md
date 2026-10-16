# Reputation System

The reputation system measures user trustworthiness on Amana based on trading behavior and dispute history. Every user receives a trust score (0–100) and a history of reputation-affecting events.

## Overview

Reputation is **non-custodial**: scores are computed on-the-fly from immutable trade and dispute records in the database. No reputation state is stored separately, and scores cannot be manually adjusted.

A user's reputation profile includes:

- **Trust Score** (0–100): Overall reputation rating. Higher scores indicate more reliable trading history.
- **Trade Statistics**: Total trades, completed trades, and disputed trades.
- **Success Rate**: Percentage of completed trades out of all trades.
- **Event History**: Recent reputation-affecting events (last 20) ordered by recency.

## Endpoints

All reputation endpoints accept both authenticated (bearer token) and unauthenticated requests. Authenticated endpoints return your own reputation; public endpoints return any user's reputation.

### Fetch your reputation

`GET /users/me/reputation`

Requires `Authorization: Bearer <token>`.

Returns your full reputation profile, including private event history.

**Response `200`**

```json
{
  "trustScore": 72,
  "totalTrades": 15,
  "completedTrades": 12,
  "disputedTrades": 1,
  "successRate": 80.0,
  "history": [
    {
      "id": "trade-abc123",
      "event": "Completed trade as seller (abc123...)",
      "impact": 5,
      "impactLabel": "+5",
      "timestamp": "2026-10-15T14:30:00.000Z",
      "type": "trade_completed"
    },
    {
      "id": "dispute-def456",
      "event": "Initiated dispute on trade def456...",
      "impact": -2,
      "impactLabel": "-2",
      "timestamp": "2026-10-14T10:15:00.000Z",
      "type": "dispute_initiated"
    }
  ]
}
```

| Status | Meaning |
|---|---|
| `200` | Reputation profile returned |
| `401` | Missing or invalid bearer token |
| `500` | Unexpected server error |

### Fetch a user's public reputation

`GET /users/{address}/reputation`

No authentication required. Returns the reputation profile for any user by Stellar address.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `address` | string | Stellar public key (e.g., `GAAA...WHF`) |

**Response `200`**

Same structure as `/users/me/reputation`.

```json
{
  "trustScore": 72,
  "totalTrades": 15,
  "completedTrades": 12,
  "disputedTrades": 1,
  "successRate": 80.0,
  "history": [
    {
      "id": "trade-abc123",
      "event": "Completed trade as seller (abc123...)",
      "impact": 5,
      "impactLabel": "+5",
      "timestamp": "2026-10-15T14:30:00.000Z",
      "type": "trade_completed"
    }
  ]
}
```

| Status | Meaning |
|---|---|
| `200` | Public reputation profile returned |
| `400` | Invalid address format (missing or malformed) |
| `500` | Unexpected server error |

## Trust Score Computation

The trust score is computed deterministically from trade and dispute records. A user's **baseline score is 50**, adjusted by:

1. **Completed trades**: +5 per completed trade (buyer or seller role)
2. **Dispute penalties**: −8 per lost dispute; −2 per initiated dispute
3. **Trade volume bonuses**: 
   - 10+ trades: +5 bonus
   - 25+ trades: +8 bonus
   - 50+ trades: +15 bonus

The final score is clamped to the range [0, 100].

### Examples

**New user:**
- Baseline: 50
- No trades or disputes
- **Score: 50**

**Active, successful trader:**
- Baseline: 50
- 15 completed trades: +75
- 1 lost dispute: −8
- 10–25 trades: +8 bonus
- **Score: 50 + 75 − 8 + 8 = 125 → clamped to 100**

**Unreliable trader:**
- Baseline: 50
- 5 completed trades: +25
- 3 lost disputes: −24
- 1 initiated dispute: −2
- **Score: 50 + 25 − 24 − 2 = 49**

## Event Types

Events are classified by type for filtering and analytics. The `type` field indicates what action triggered the reputation change.

| Event Type | Triggered By | Example Impact |
|---|---|---|
| `trade_completed` | Trade moves to `COMPLETED` status | +5 |
| `trade_initiated` | User creates a new trade | 0 (informational) |
| `dispute_initiated` | User opens a dispute on a trade | −2 |
| `dispute_resolved` | A dispute initiated by this user is resolved | −10 |
| `dispute_involved` | User is involved in a dispute (not as initiator) | (no direct impact) |
| `account_created` | User profile first created | 0 (informational) |

Recent events (last 20) are included in the `history` array, ordered by timestamp (newest first).

## Privacy & Exposure

- **Trust scores are public**: Anyone can query any user's reputation via `GET /users/{address}/reputation`.
- **Event details are included in public history**: Recent events are visible to anyone querying a user's profile.
- **No masking or anonymization**: Event descriptions include trade IDs (truncated) and user roles.
- **Aggregates are always accurate**: Stats like `totalTrades` and `successRate` reflect the live state of the database.

## Caching

Reputation is computed on-the-fly for every request. There is no server-side caching, ensuring scores are always current. Client-side caching is allowed but should use short TTLs (5–60 seconds) to avoid stale scores.

## Common Questions

**Q: Can I delete or hide events from my history?**  
A: No. Reputation is immutable and tied to on-chain trade records. Events cannot be removed or modified.

**Q: Does completing a trade increase my score every time?**  
A: Yes. Each completed trade adds +5 to your score (bounded at 100). There is no diminishing return per trade.

**Q: What if I'm involved in a dispute but don't initiate it?**  
A: Your score is penalized only if you lose the dispute (−8). If the dispute is resolved in your favor, your score remains unchanged from the dispute initiation.

**Q: Can admins manually adjust reputation scores?**  
A: No. Reputation is fully deterministic and cannot be manually overridden. Only on-chain trade and dispute outcomes affect scores.

**Q: How often is my reputation updated?**  
A: In real-time, as trades and disputes transition states. The `/users/me/reputation` endpoint reflects the live state of the database at query time.
