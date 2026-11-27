# ADR-006: Vaults and Savings Goals Design

**Status**: Accepted  
**Decision Date**: 2025-10-20  
**Authors**: Innov8 Architecture Team  

---

## 1. Context

The Amana platform's core value proposition is escrow-secured agricultural trade with dynamic loss-sharing. Over time, users may wish to build financial resilience through structured savings programs. This ADR captures the design decision for integrating a **Vault** and **Savings Goals** subsystem into the backend architecture, enabling users to:

1. Create on-chain **vaults** that hold locked funds independent of trade escrow
2. Define **savings goals** with deadline-based targets and progress tracking
3. Monitor goal progress through comprehensive analytics and progression metrics

The subsystem bridges **on-chain contract logic** (Soroban) with **off-chain metadata** (Supabase) to provide a unified savings experience while maintaining the platform's security and decentralization principles.

---

## 2. Problem Statement

Without a savings subsystem, users engaging with Amana only interact with the platform during active trades. Funds held in their Stellar wallets remain outside the platform's visibility, and there is no structured mechanism to:

- Set and track financial goals
- Correlate on-chain balance changes with user intent
- Provide analytics on goal progression relative to deadlines
- Encourage repeat engagement through goal-based incentives

This limits user retention and the platform's ability to become a continuous financial service rather than a transactional escrow tool.

---

## 3. Decision

We adopt a two-tier savings architecture:

### 3.1 On-Chain Vaults (Soroban Smart Contract)

Vaults are on-chain entities managed by the `amana_escrow` Soroban contract. Each vault:

- **Belongs to a single user** (wallet address)
- **Holds funds** as USDC/cNGN on the Stellar network
- **Emits events** when balances change (VaultCreated, VaultFunded, VaultWithdrawn)
- **Is cryptographically owned** by the user's wallet keypair

**Rationale:**
- On-chain storage ensures funds are user-sovereign and not custodial
- Event emission enables off-chain indexing without polling the contract state
- Separating vaults from escrow contracts reduces state complexity in trade-critical code

### 3.2 Off-Chain Goal Metadata (Supabase)

Goals are off-chain entities stored in the `Goal` table in the backend database. Each goal:

- **References a vault** (foreign key to on-chain vaultId)
- **Belongs to a user** (foreign key to userId)
- **Stores target and progress**: `targetAmountUsdc`, `currentAmountUsdc`, `deadline`
- **Has a lifecycle**: ACTIVE → COMPLETED or CANCELLED
- **Enables analytics**: isOnTrack calculation, percentage-complete, daysRemaining

**Rationale:**
- Off-chain metadata avoids bloating the contract with user-defined goal logic
- Goal definition is user-customizable and not consensus-critical
- Off-chain storage enables rapid iteration on analytics logic without re-auditing contracts
- Database-backed goals integrate naturally with the existing event listener pattern

### 3.3 Tight Event-Driven Coupling

The `EventListenerService` processes Soroban events and invokes the `SavingsService` to:

1. **Create vaults** when a user first deposits into a vault contract
2. **Update vault balances** when VaultFunded or VaultWithdrawn events fire
3. **Update goal progress** by synchronizing currentAmountUsdc with on-chain balances
4. **Complete or cancel goals** based on explicit user or contract actions

**Rationale:**
- Event-driven updates ensure off-chain state is consistent with on-chain reality
- Avoids the need for continuous polling of contract state
- Scales naturally as user count grows (events fan out, poll-based sync would not)

---

## 4. Data Model

### Vault (Off-Chain)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | Int (PK) | Internal database ID |
| `vaultId` | String (UK) | On-chain vault identifier from Soroban |
| `ownerAddress` | String (FK→User) | Wallet address of vault owner |
| `balanceUsdc` | String (Decimal) | Current vault balance (synced from on-chain) |
| `createdAt` | DateTime | Record creation timestamp |
| `updatedAt` | DateTime | Last synchronization timestamp |

### Goal (Off-Chain)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | Int (PK) | Internal database ID |
| `goalId` | String (UK) | On-chain goal identifier from Soroban |
| `vaultId` | String (FK→Vault) | Parent vault ID |
| `userId` | Int (FK→User) | Goal creator |
| `targetAmountUsdc` | String (Decimal) | Target to reach |
| `currentAmountUsdc` | String (Decimal) | Current progress |
| `deadline` | DateTime | Target completion date |
| `status` | Enum (ACTIVE/COMPLETED/CANCELLED) | Lifecycle state |
| `createdAt` | DateTime | Goal creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

---

## 5. API Layer

### Goals Analytics Endpoint

**Endpoint**: `GET /goals` (authenticated)

**Response**:
```json
{
  "walletAddress": "GXXXXXXXXXX",
  "totalGoals": 3,
  "activeGoals": 2,
  "completedGoals": 1,
  "totalTargetAmount": "500.0",
  "totalCurrentAmount": "250.0",
  "overallProgressPercentage": 50,
  "goals": [
    {
      "goalId": "goal_abc123",
      "targetAmountUsdc": "200.0",
      "currentAmountUsdc": "100.0",
      "percentageComplete": 50,
      "daysRemaining": 30,
      "deadline": "2025-11-20T00:00:00Z",
      "status": "ACTIVE",
      "vaultBalance": "150.0",
      "isOnTrack": true
    }
  ],
  "timestamp": "2025-10-20T12:34:56Z"
}
```

**Features**:
- **On-track calculation**: Compares `percentageComplete` to expected progress based on time elapsed
- **Aggregate metrics**: Sums across all user goals
- **Vault balance correlation**: Each goal knows its parent vault's current balance

---

## 6. Event Handling Pipeline

The backend's `EventListenerService` → `EventHandlers` → `SavingsService` pipeline:

```
Soroban Contract Event
  │ (VaultCreated / VaultFunded / VaultWithdrawn / GoalCreated / GoalCompleted)
  │
  ▼
EventListenerService.poll()
  │ Deduplicate via (ledgerSequence, contractId, eventId)
  │ Retry with exponential backoff
  │
  ▼
EventHandlers.dispatch(eventType, payload)
  │ Switch on event type
  │
  ▼
SavingsService.updateVaultBalance() / updateGoalProgress()
  │ Atomic Prisma transaction
  │ Optimistic concurrency via version field
  │
  ▼
Database Update + Webhook Dispatch
```

---

## 7. Assumptions and Constraints

1. **On-chain vaults are idempotent**: Creating a vault with the same `vaultId` twice should not duplicate the off-chain record (handled by UNIQUE constraint)
2. **Balance updates are serialized**: Events are processed in ledger sequence order, ensuring balances never go out-of-sync with on-chain state
3. **User account exists**: A `Goal` or `Vault` can only be created if the user wallet already has a `User` record in the database
4. **Decimal precision**: All currency amounts are stored as strings to preserve USDC's 7 decimal places
5. **No contract state query in hot path**: The backend never directly queries contract storage; it relies on events to stay synchronized

---

## 8. Security Considerations

1. **User isolation**: Each vault/goal is bound to a wallet address; only the owner can read or modify their vaults/goals
2. **On-chain sovereignty**: Vault funds are held on-chain; the backend is not custodial
3. **Event immutability**: Once processed, events are recorded in `ProcessedEvent` and cannot be replayed
4. **Off-chain metadata integrity**: Goals and vault metadata are soft-referenced; contract is source of truth for balances

---

## 9. Deployment Considerations

1. **Schema migration**: Add `Vault` and `Goal` models to `prisma/schema.prisma`; run `prisma migrate` in all environments
2. **Event listener updates**: Extend `eventHandlers.ts` to handle vault and goal events
3. **API route registration**: Mount `createGoalsRouter()` in `publicApi.router.ts`
4. **Backwards compatibility**: Existing trade events are unaffected; savings subsystem is purely additive

---

## 10. Future Extensions

- **Goal-based incentives**: Bonus rewards for completing goals on time
- **Goal templates**: Pre-configured goal archetypes (e.g., "Save 3 months of operating costs")
- **Goal sharing**: Allow users to invite friends to collaborative savings goals
- **Analytics export**: Support audit trails and tax reporting of goal progress
- **Multi-currency goals**: Enable goals in local currencies with automatic Stellar Path Payment conversion

---

## 11. References

- [ADR-003: Off-chain vs. On-chain Data Partitioning](./ADR-003-offchain-vs-onchain-data-partitioning.md) — Rationale for this split
- [Data Model Relationships](../data-model-relationships.md) — Complete schema documentation
- [Event Flow](../event-flow.md) — Event listener architecture and deduplication strategy
- Soroban contract: `contracts/amana_escrow/src/lib.rs`
