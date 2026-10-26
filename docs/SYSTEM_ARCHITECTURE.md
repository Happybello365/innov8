# System-Wide Architecture Diagram

This document provides a comprehensive visual representation of the Amana backend architecture, showing all major subsystems, their interactions, data flows, and integration points.

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "Clients"
        Web["🌐 Web Frontend<br/>Next.js"]
        Mobile["📱 Mobile App<br/>React Native"]
        Admin["🔧 Admin Dashboard"]
    end

    subgraph "Client Authentication & Wallet"
        Freighter["🔐 Freighter Wallet"]
        Albedo["🔐 Albedo Wallet"]
        Auth["Authentication Service<br/>JWT + Signature Challenge"]
    end

    subgraph "Blockchain"
        Stellar["⛓️ Stellar Network"]
        Soroban["Soroban Contract<br/>amana_escrow"]
    end

    subgraph "Backend API Layer - Express.js"
        Router["Public API Router<br/>/api/v1 & legacy /"]
        PublicAPI["Public Routes"]
        AdminAPI["Admin Routes"]
    end

    subgraph "Backend Core Services"
        Trade["Trade Service<br/>CRUD + Validation"]
        Dispute["Dispute Service<br/>Status + Mediation"]
        Savings["Savings Service<br/>Vaults & Goals"]
        Evidence["Evidence Service<br/>IPFS + Uploads"]
        Auth2["Auth Service<br/>Challenge + JWT"]
    end

    subgraph "Integration Services"
        Stellar2["Stellar Service<br/>TX Build + Sign"]
        Contract["Contract Service<br/>Soroban ABI"]
        IPFS["IPFS Service<br/>Pinata Gateway"]
        Webhook["Webhook Service<br/>HTTP Dispatch"]
    end

    subgraph "Event Processing Pipeline"
        EventListener["Event Listener Service<br/>Poll Soroban RPC"]
        EventHandlers["Event Handlers<br/>Dispatch by Type"]
        Dedup["Deduplication<br/>ProcessedEvent"]
        Outbox["Retry Outbox<br/>ChainEventOutbox"]
    end

    subgraph "Data Layer"
        DB["Supabase PostgreSQL<br/>Prisma ORM"]
        Redis["Redis Cache<br/>Idempotency + Locks"]
    end

    subgraph "Observability"
        Logging["Structured Logging<br/>Pino + Correlation IDs"]
        Tracing["OpenTelemetry Tracing<br/>Jaeger/Zipkin"]
        Metrics["Prometheus Metrics<br/>Golden Signals"]
    end

    Web -->|Login| Auth
    Mobile -->|Login| Auth
    Admin -->|Login + Verify| Auth
    Freighter -->|Sign Challenge| Auth
    Albedo -->|Sign Challenge| Auth

    Auth -->|Generate JWT| Auth2

    Web -->|REST Calls| Router
    Mobile -->|REST Calls| Router
    Admin -->|REST + CSRF| Router

    Router -->|Route| PublicAPI
    Router -->|Route (Auth Required)| AdminAPI

    PublicAPI -->|Trade Ops| Trade
    PublicAPI -->|Dispute Ops| Dispute
    PublicAPI -->|Goal Analytics| Savings
    PublicAPI -->|Evidence Upload| Evidence

    AdminAPI -->|Manage Streams| AdminAPI
    AdminAPI -->|Batch Operations| AdminAPI
    AdminAPI -->|Audit Logs| AdminAPI

    Trade -->|Create/Fund TX| Stellar2
    Dispute -->|Resolve TX| Stellar2
    Savings -->|Vault TX| Stellar2

    Stellar2 -->|Sign TX| Contract
    Contract -->|Send TX| Stellar

    Stellar -->|Emit Events| EventListener
    EventListener -->|Parse Events| Dedup
    Dedup -->|Deduplicate| Outbox
    Outbox -->|Dispatch| EventHandlers

    EventHandlers -->|Handle Trade Events| Trade
    EventHandlers -->|Handle Dispute Events| Dispute
    EventHandlers -->|Handle Vault Events| Savings

    Trade -->|Read/Write| DB
    Dispute -->|Read/Write| DB
    Savings -->|Read/Write| DB
    Evidence -->|Read/Write| DB

    Evidence -->|Upload/Stream| IPFS

    Trade -->|Cache| Redis
    Evidence -->|Idempotency| Redis

    Trade -->|Dispatch| Webhook
    Dispute -->|Dispatch| Webhook
    Savings -->|Dispatch| Webhook

    Trade -->|Log| Logging
    Dispute -->|Log| Logging
    Savings -->|Log| Logging
    Stellar2 -->|Log| Logging
    EventListener -->|Log| Logging

    Trade -->|Trace| Tracing
    Dispute -->|Trace| Tracing
    Savings -->|Trace| Tracing
    EventListener -->|Trace| Tracing

    Trade -->|Emit| Metrics
    Dispute -->|Emit| Metrics
    Savings -->|Emit| Metrics
    EventListener -->|Emit| Metrics

    style Stellar fill:#1f1f1f,stroke:#ffd700,stroke-width:3px,color:#ffd700
    style Soroban fill:#1f1f1f,stroke:#ffd700,stroke-width:2px,color:#ffd700
    style DB fill:#2d5a3d,stroke:#4db8a8,stroke-width:2px,color:#4db8a8
    style Redis fill:#c41e3a,stroke:#fff,stroke-width:2px,color:#fff
    style IPFS fill:#0a7088,stroke:#00a3e0,stroke-width:2px,color:#00a3e0
```

---

## 2. Request Flow: Trade Creation to Settlement

This diagram shows how a single trade request flows through the entire system from creation through event processing.

```mermaid
graph LR
    Client["Client<br/>POST /trades"]
    Router["Public Router"]
    TradeCtrl["Trade Controller<br/>validateRequest + auth"]
    TradeSvc["Trade Service<br/>Business Logic"]
    ContractSvc["Contract Service<br/>Build Soroban TX"]
    StellarSvc["Stellar Service<br/>Sign + Submit"]
    DB1["Database<br/>INSERT Trade"]
    EventLoop["Event Listener<br/>Poll for Events"]
    Handler["Event Handler<br/>handle(TradeCreated)"]
    DB2["Database<br/>UPDATE Trade.status"]
    WebhookSvc["Webhook Service<br/>HTTP POST"]
    Client2["Webhook Target<br/>Receive Event"]

    Client -->|"1. POST /trades"| Router
    Router -->|"2. Route"| TradeCtrl
    TradeCtrl -->|"3. Validate + Auth"| TradeSvc
    TradeSvc -->|"4. Validate Business Rules"| TradeSvc
    TradeSvc -->|"5. Build Soroban TX"| ContractSvc
    ContractSvc -->|"6. Create Transaction"| StellarSvc
    StellarSvc -->|"7. Submit to Stellar"| Stellar["Stellar Network"]
    TradeSvc -->|"8. Create Record (PENDING_SIGNATURE)"| DB1
    Client -->|"9. Return 201 Created<br/>with tradeId"| Client

    Stellar -->|"10. Emit TradeCreated Event"| EventLoop
    EventLoop -->|"11. Deduplicate"| Handler
    Handler -->|"12. update status → CREATED"| DB2
    Handler -->|"13. Dispatch trade.created webhook"| WebhookSvc
    WebhookSvc -->|"14. HTTP POST"| Client2

    style Client fill:#e1f5e1,stroke:#4caf50
    style Stellar fill:#1f1f1f,stroke:#ffd700,color:#ffd700
    style Handler fill:#fff3e0,stroke:#ff9800
    style DB1 fill:#e3f2fd,stroke:#2196f3
    style DB2 fill:#e3f2fd,stroke:#2196f3
```

---

## 3. Event Processing Pipeline

This diagram details the complete event ingestion, deduplication, retry, and handling flow.

```mermaid
graph TB
    subgraph "Polling"
        Stellar["Stellar Network<br/>Soroban RPC"]
        Poll["EventListenerService.poll()"]
        GetEvents["sorobanRpc.getEvents()"]
    end

    subgraph "Deduplication"
        InMem["In-Memory Set<br/>last N ledgers"]
        Check["Check (ledgerSeq,<br/>contractId, eventId)"]
        ProcessedEv["ProcessedEvent Table<br/>Durable Dedup"]
    end

    subgraph "Retry Outbox"
        Outbox["ChainEventOutbox<br/>INSERT or PENDING"]
        CheckStatus["SELECT status"]
        IsProcessed{Processed?}
        IsPending{Pending?}
        Update["UPDATE nextAttemptAt<br/>with exponential backoff"]
        DeadLetter["Move to DEAD_LETTER<br/>if maxAttempts exceeded"]
    end

    subgraph "Dispatch"
        Handler["EventHandlers.dispatch()"]
        Switch["Switch on eventType"]
        TypeMap["TradeCreated |<br/>TradeFunded |<br/>DeliveryConfirmed |<br/>FundsReleased |<br/>DisputeInitiated |<br/>VaultFunded |<br/>GoalCreated | ..."]
    end

    subgraph "Handlers"
        TradeHandler["Trade Event Handler<br/>update Trade.status"]
        DisputeHandler["Dispute Event Handler<br/>update Dispute.status"]
        SavingsHandler["Savings Event Handler<br/>updateGoalProgress()"]
    end

    subgraph "Persistence"
        DB["Prisma Transaction<br/>Atomic Write"]
        WebhookQ["Webhook Queue<br/>Enqueue for dispatch"]
    end

    Stellar -->|Poll every N seconds| Poll
    Poll -->|Call| GetEvents
    GetEvents -->|Return Events| InMem

    InMem -->|Check each event| Check
    Check -->|Already seen?| ProcessedEv
    ProcessedEv -->|If new:| Outbox

    Outbox -->|INSERT or SELECT| CheckStatus
    CheckStatus -->|nextAttemptAt <= now()?| IsProcessed

    IsProcessed -->|Yes| Handler
    IsProcessed -->|No, schedule retry| Update
    Update -->|Retry at| Poll

    IsPending -->|Too many attempts| DeadLetter
    DeadLetter -->|Log + Alert| Outbox

    Handler -->|Decode Payload| Switch
    Switch -->|Route| TypeMap

    TypeMap -->|TradeCreated / TradeFunded| TradeHandler
    TypeMap -->|DisputeInitiated / DisputeResolved| DisputeHandler
    TypeMap -->|VaultFunded / GoalCreated| SavingsHandler

    TradeHandler -->|Atomic Txn| DB
    DisputeHandler -->|Atomic Txn| DB
    SavingsHandler -->|Atomic Txn| DB

    DB -->|Mark as PROCESSED| ProcessedEv
    DB -->|On success| WebhookQ

    style Stellar fill:#1f1f1f,stroke:#ffd700,color:#ffd700
    style Outbox fill:#fff3e0,stroke:#ff9800
    style DeadLetter fill:#ffebee,stroke:#f44336
    style Handler fill:#e3f2fd,stroke:#2196f3
    style DB fill:#f3e5f5,stroke:#9c27b0
```

---

## 4. Savings/Vault Subsystem Detail

This diagram shows the specific flow of vault and goal operations.

```mermaid
graph TB
    subgraph "User Interactions"
        CreateVault["User calls smart contract<br/>to create vault"]
        Deposit["User deposits cNGN/USDC<br/>into vault"]
        CreateGoal["User creates savings goal<br/>on backend"]
        QueryGoals["User queries goal analytics<br/>GET /goals"]
    end

    subgraph "Smart Contract (On-Chain)"
        VaultCreated["VaultCreatedEvent<br/>vaultId, owner"]
        VaultFunded["VaultFundedEvent<br/>vaultId, amount"]
        VaultWithdrawn["VaultWithdrawnEvent<br/>vaultId, amount"]
    end

    subgraph "Event Listener & Handlers"
        EventListener["EventListenerService<br/>polls Soroban"]
        VaultHandler["Handle VaultCreatedEvent"]
        DepositHandler["Handle VaultFundedEvent"]
        WithdrawHandler["Handle VaultWithdrawnEvent"]
    end

    subgraph "Savings Service"
        CreateVaultRecord["SavingsService.createVault()"]
        UpdateBalance["SavingsService.updateVaultBalance()"]
        UpdateProgress["SavingsService.updateGoalProgress()"]
    end

    subgraph "Database - Off-Chain"
        Vault["Vault Table<br/>vaultId, owner,<br/>balanceUsdc"]
        Goal["Goal Table<br/>goalId, vaultId,<br/>targetAmount,<br/>currentAmount"]
    end

    subgraph "API Responses"
        GoalsAnalytics["GET /goals Response<br/>totalGoals, activeGoals,<br/>goals[], progress%"]
        GoalDetail["GoalAnalytics<br/>targetAmount, current,<br/>daysRemaining, isOnTrack"]
    end

    CreateVault -->|TX| VaultCreated
    Deposit -->|TX| VaultFunded
    CreateGoal -->|POST /goals| Goal

    VaultCreated -->|Event| EventListener
    VaultFunded -->|Event| EventListener
    VaultWithdrawn -->|Event| EventListener

    EventListener -->|Dispatch| VaultHandler
    EventListener -->|Dispatch| DepositHandler
    EventListener -->|Dispatch| WithdrawHandler

    VaultHandler -->|Create| CreateVaultRecord
    DepositHandler -->|Update| UpdateBalance
    DepositHandler -->|Sync to| UpdateProgress

    CreateVaultRecord -->|INSERT| Vault
    UpdateBalance -->|UPDATE balanceUsdc| Vault
    UpdateProgress -->|UPDATE currentAmountUsdc| Goal

    QueryGoals -->|Auth + Fetch| GoalsAnalytics
    GoalsAnalytics -->|Query Vault + Goal| Vault
    GoalsAnalytics -->|Query Goal| Goal
    GoalsAnalytics -->|Compute| GoalDetail
    GoalDetail -->|Return| QueryGoals

    style VaultCreated fill:#1f1f1f,stroke:#ffd700,color:#ffd700
    style VaultFunded fill:#1f1f1f,stroke:#ffd700,color:#ffd700
    style Vault fill:#2d5a3d,stroke:#4db8a8,color:#4db8a8
    style Goal fill:#2d5a3d,stroke:#4db8a8,color:#4db8a8
    style GoalsAnalytics fill:#e3f2fd,stroke:#2196f3,color:#2196f3
    style EventListener fill:#fff3e0,stroke:#ff9800
```

---

## 5. Core Database Schema

This diagram shows the relationships between all key entities.

```mermaid
erDiagram
    USER ||--o{ TRADE : buys
    USER ||--o{ TRADE : sells
    USER ||--o{ VAULT : owns
    USER ||--o{ GOAL : creates
    USER ||--o{ DISPUTE : initiates

    TRADE ||--|| DISPUTE : has
    TRADE ||--o{ TRADEEVIDENCE : contains
    TRADE ||--|| DELIVERYMANIFEST : has

    VAULT ||--o{ GOAL : contains

    DISPUTE ||--o{ DISPUTECATEGORY : belongs

    USER {
        int id PK
        varchar walletAddress UK
        varchar displayName
        datetime createdAt
        datetime updatedAt
    }

    TRADE {
        int id PK
        varchar tradeId UK
        varchar buyerAddress FK
        varchar sellerAddress FK
        varchar amountUsdc
        int buyerLossBps
        int sellerLossBps
        string status
        int version
        datetime fundedAt
        datetime deliveredAt
        datetime completedAt
        datetime createdAt
        datetime updatedAt
    }

    VAULT {
        int id PK
        varchar vaultId UK
        varchar ownerAddress FK
        varchar balanceUsdc
        datetime createdAt
        datetime updatedAt
    }

    GOAL {
        int id PK
        varchar goalId UK
        varchar vaultId FK
        int userId FK
        varchar targetAmountUsdc
        varchar currentAmountUsdc
        datetime deadline
        string status
        datetime createdAt
        datetime updatedAt
    }

    DISPUTE {
        int id PK
        varchar tradeId FK UK
        varchar initiator FK
        text reason
        string status
        int categoryId FK
        datetime resolvedAt
        datetime createdAt
        datetime updatedAt
    }

    DISPUTECATEGORY {
        int id PK
        varchar name UK
        text description
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    TRADEEVIDENCE {
        int id PK
        varchar tradeId FK
        varchar cid
        varchar filename
        varchar mimeType
        varchar uploadedBy
        datetime createdAt
    }

    DELIVERYMANIFEST {
        int id PK
        varchar tradeId FK UK
        varchar driverName
        varchar vehicleRegistration
        text routeDescription
        datetime expectedDeliveryAt
        varchar driverNameHash
        datetime createdAt
    }

    PROCESSEDEVENT {
        int id PK
        int ledgerSequence
        varchar contractId
        varchar eventId
        datetime processedAt
    }

    CHAINEVENTOUTBOX {
        int id PK
        int ledgerSequence
        varchar contractId
        varchar eventId
        varchar eventType
        varchar tradeId
        json payload
        string status
        int attempts
        datetime nextAttemptAt
        text lastError
        datetime deadLetteredAt
        datetime processedAt
        datetime createdAt
        datetime updatedAt
    }
```

---

## 6. Middleware & Observability Stack

This diagram shows the middleware layers and observability integration.

```mermaid
graph TB
    subgraph "Request Ingress"
        Req["Incoming HTTP Request"]
        Helmet["Helmet<br/>Security Headers"]
        CORS["CORS Policy"]
        BodyLimits["Body Limits<br/>100KB default"]
    end

    subgraph "Middleware Chain"
        CorrelationId["Correlation ID Middleware<br/>x-correlation-id + x-request-id"]
        Tracing["Tracing Middleware<br/>OpenTelemetry"]
        Logger["Logger Middleware<br/>Pino + HTTP"]
        ReqLogger["Request Logger<br/>method, path, status, duration"]
    end

    subgraph "API Versioning & Routing"
        APIVersion["API Version Middleware<br/>Deprecation Headers"]
        PublicRouter["Public API Router<br/>/api/v1 + legacy"]
        AdminRouter["Admin Router<br/>Feature Gate + CSRF"]
    end

    subgraph "Business Logic"
        Controllers["Controllers<br/>req validation"]
        Services["Services<br/>domain logic"]
        Repositories["Repositories<br/>data access"]
    end

    subgraph "Observability Export"
        Logging["📊 Structured Logs<br/>Pino + Correlation IDs"]
        Tracing2["📊 Distributed Traces<br/>OpenTelemetry"]
        Metrics["📊 Prometheus Metrics<br/>Golden Signals"]
    end

    subgraph "Error Handling"
        ErrorHandler["Error Handler Middleware<br/>Standardized error format"]
        ErrorResponse["Error Response<br/>code + details"]
    end

    Req -->|Parse| Helmet
    Helmet -->|Check| CORS
    CORS -->|Limit| BodyLimits
    BodyLimits -->|Propagate| CorrelationId

    CorrelationId -->|Generate IDs| Tracing
    Tracing -->|Create spans| Logger
    Logger -->|Log request| ReqLogger
    ReqLogger -->|Emit| Logging

    ReqLogger -->|Route| APIVersion
    APIVersion -->|Route| PublicRouter
    PublicRouter -->|Route| Controllers

    Controllers -->|Call| Services
    Services -->|Query| Repositories

    Services -->|Emit| Metrics
    Controllers -->|Catch errors| ErrorHandler
    ErrorHandler -->|Format| ErrorResponse
    ErrorHandler -->|Log| Logging

    Tracing -->|Export traces| Tracing2
    Logging -->|Pino output| Logging
    Services -->|Prometheus counters| Metrics

    style Logging fill:#f0f0f0,stroke:#666,stroke-width:2px
    style Tracing2 fill:#f0f0f0,stroke:#666,stroke-width:2px
    style Metrics fill:#f0f0f0,stroke:#666,stroke-width:2px
```

---

## 7. Job Queue & Background Workers

This diagram shows the background job processing architecture.

```mermaid
graph TB
    subgraph "Job Triggers"
        EventHandler["Event Handlers<br/>enqueue jobs"]
        CronScheduler["Cron Scheduler<br/>BullMQ queue"]
        ManualTrigger["Manual Admin Trigger<br/>API endpoint"]
    end

    subgraph "Job Queues"
        WebhookQueue["Webhook Queue<br/>bullmq:webhook"]
        ReconcilQueue["Reconciliation Queue<br/>bullmq:reconciliation"]
        NotifyQueue["Notification Queue<br/>bullmq:notification"]
        PIIScanQueue["PII Scan Queue<br/>bullmq:pii-scan"]
        WebhookPurgeQueue["Webhook Purge Queue<br/>bullmq:webhook-purge"]
    end

    subgraph "Job Workers"
        WebhookWorker["Webhook Worker<br/>HTTP POST dispatch"]
        ReconcilWorker["Reconciliation Worker<br/>daily ledger sync"]
        NotifyWorker["Notification Worker<br/>send in-app alerts"]
        PIIWorker["PII Scanner Worker<br/>detect log leaks"]
        PurgeWorker["Purge Worker<br/>clean old records"]
    end

    subgraph "External Services"
        WebhookTarget["Webhook Targets<br/>customer webhooks"]
        Database["Database<br/>sync state"]
        Notifications["Notification System<br/>in-app alerts"]
    end

    subgraph "Monitoring"
        QueueMetrics["Queue Metrics<br/>pending, active, failed"]
        JobHeartbeat["Job Heartbeat<br/>monitor workers"]
        Alerts["Alerting<br/>dead-letter detection"]
    end

    EventHandler -->|enqueue| WebhookQueue
    EventHandler -->|enqueue| ReconcilQueue
    CronScheduler -->|trigger| ReconcilQueue
    CronScheduler -->|trigger| PIIScanQueue
    CronScheduler -->|trigger| WebhookPurgeQueue
    ManualTrigger -->|enqueue| NotifyQueue

    WebhookQueue -->|process| WebhookWorker
    ReconcilQueue -->|process| ReconcilWorker
    NotifyQueue -->|process| NotifyWorker
    PIIScanQueue -->|process| PIIWorker
    WebhookPurgeQueue -->|process| PurgeWorker

    WebhookWorker -->|HTTP POST| WebhookTarget
    ReconcilWorker -->|sync| Database
    NotifyWorker -->|dispatch| Notifications
    PIIWorker -->|scan + alert| Database
    PurgeWorker -->|delete stale| Database

    WebhookQueue -->|metrics| QueueMetrics
    ReconcilQueue -->|metrics| QueueMetrics
    NotifyQueue -->|metrics| QueueMetrics

    JobHeartbeat -->|monitor| WebhookWorker
    JobHeartbeat -->|monitor| ReconcilWorker
    JobHeartbeat -->|monitor| NotifyWorker

    QueueMetrics -->|export| Alerts
    JobHeartbeat -->|export| Alerts

    style WebhookWorker fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style ReconcilWorker fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style NotifyWorker fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style Alerts fill:#ffebee,stroke:#f44336,stroke-width:2px
```

---

## 8. Key Files & Modules Reference

| Layer | Module | Responsibility |
|-------|--------|-----------------|
| **Router** | `src/routes/publicApi.router.ts` | Mount all public routes (v1 + legacy) |
| | `src/routes/admin.*.routes.ts` | Admin-gated routes |
| **Controllers** | `src/controllers/trade.controller.ts` | Trade CRUD endpoint handlers |
| | `src/controllers/dispute.controller.ts` | Dispute endpoint handlers |
| **Services** | `src/services/trade.service.ts` | Trade domain logic |
| | `src/services/dispute.service.ts` | Dispute logic & mediation |
| | `src/services/savings.service.ts` | Vault & goal analytics |
| | `src/services/stellar.service.ts` | Stellar TX building & submission |
| | `src/services/contract.service.ts` | Soroban ABI & call building |
| | `src/services/eventListener.service.ts` | Polling & event coordination |
| | `src/services/eventHandlers.ts` | Event dispatching by type |
| | `src/services/evidence.service.ts` | Evidence upload & IPFS |
| | `src/services/auth.service.ts` | JWT & challenge-response |
| **Middleware** | `src/middleware/auth.middleware.ts` | JWT verification |
| | `src/middleware/correlationId.middleware.ts` | Trace ID generation |
| | `src/middleware/tracing.middleware.ts` | OpenTelemetry setup |
| | `src/middleware/errorHandler.ts` | Global error catch |
| **Database** | `src/lib/db.ts` | Prisma client initialization |
| | `prisma/schema.prisma` | Full schema definition |
| **Jobs** | `src/jobs/queue.ts` | BullMQ queue initialization |
| | `src/jobs/workers/*.worker.ts` | Individual job processors |
| **Config** | `src/config/env.ts` | Environment validation |
| | `src/config/tracing.ts` | OpenTelemetry setup |
| | `src/config/stellar.ts` | Network & account config |

---

## 9. Deployment Architecture

This diagram shows how the system deploys to staging and production environments.

```mermaid
graph TB
    subgraph "Development"
        DevLocal["Developer Machine<br/>npm run dev"]
        DevDB["Local PostgreSQL<br/>Docker"]
        DevRedis["Local Redis<br/>Docker"]
    end

    subgraph "Staging Environment"
        StagingApp["Staging API Pod<br/>Node.js"]
        StagingDB["Staging Database<br/>Supabase"]
        StagingRedis["Staging Redis<br/>Managed"]
        StagingTestnet["Testnet Stellar<br/>Sandbox RPC"]
    end

    subgraph "Production Environment"
        ProdApp["Production API Pod<br/>Node.js - replicated"]
        ProdDB["Production Database<br/>Supabase - HA"]
        ProdRedis["Production Redis<br/>Managed - HA"]
        ProdMainnet["Mainnet Stellar<br/>Primary RPC + fallback"]
    end

    subgraph "CI/CD Pipeline"
        GH["GitHub Actions<br/>.github/workflows/"]
        Lint["Lint + Type Check"]
        Test["Run Tests"]
        Build["Docker Build"]
        Push["Push to Registry"]
        Deploy["Deploy to Kube"]
    end

    subgraph "Monitoring & Logs"
        Prometheus["Prometheus<br/>Metrics"]
        Grafana["Grafana<br/>Dashboards"]
        Logs["Centralized Logs<br/>ELK/Loki"]
        Alerts["Alert Manager<br/>PagerDuty"]
    end

    DevLocal -->|npm install| DevDB
    DevLocal -->|redis-cli| DevRedis

    GH -->|trigger| Lint
    Lint -->|pass| Test
    Test -->|pass| Build
    Build -->|push| Push
    Push -->|deploy staging| StagingApp

    StagingApp -->|connect| StagingDB
    StagingApp -->|connect| StagingRedis
    StagingApp -->|poll| StagingTestnet

    StagingApp -->|emit| Prometheus
    StagingApp -->|export logs| Logs
    Prometheus -->|visualize| Grafana
    Logs -->|alert on errors| Alerts

    Deploy -->|canary| ProdApp
    ProdApp -->|connect| ProdDB
    ProdApp -->|connect| ProdRedis
    ProdApp -->|poll| ProdMainnet

    ProdApp -->|emit| Prometheus
    ProdApp -->|export logs| Logs
    Prometheus -->|visualize| Grafana
    Logs -->|alert on errors| Alerts

    style GH fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style StagingApp fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    style ProdApp fill:#ffebee,stroke:#f44336,stroke-width:2px
    style Prometheus fill:#f0f0f0,stroke:#666,stroke-width:2px
```

---

## 10. Summary

The Amana backend is a layered, event-driven system built on:

1. **REST API** — Versioned Express.js routes for trades, disputes, evidence, and goals
2. **Smart Contract Integration** — Soroban TX building + event polling for on-chain synchronization
3. **Event Processing** — Resilient, idempotent event listener with retry outbox and webhook dispatch
4. **Savings Subsystem** — Vault + goal tracking with off-chain metadata and on-chain balance sync
5. **Observability** — Structured logging, distributed tracing, Prometheus metrics, and correlation IDs
6. **Data Persistence** — Supabase PostgreSQL with Prisma ORM, Redis for caching and idempotency
7. **Background Jobs** — BullMQ job queue with specialized workers for webhooks, reconciliation, and cleanup
8. **Security** — JWT auth, CSRF protection, PII encryption, audit trails, and role-based access control

This architecture enables reliable, auditable, and scalable agricultural trade escrow with integrated savings goals.
