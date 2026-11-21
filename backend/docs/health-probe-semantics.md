# Health Probe Semantics — innov8 Backend

Issue #224 introduces three distinct probe tiers to prevent self-inflicted outages
during third-party dependency brownouts (e.g. Stellar RPC slowness).

---

## Probe Tiers

### 1. Liveness — `GET /health/live`

**Purpose:** Confirms the Node.js process is alive and the event loop is
running. Contains **zero I/O**; it can never hang or fail due to an external
dependency.

**k8s probe type:** `livenessProbe`
**Failure action:** Pod is killed and restarted by the kubelet.

**When it fails:** Never, unless the process itself is frozen/deadlocked.
Do **not** add any database or network calls here.

**Response (200 OK):**
```json
{ "status": "alive", "timestamp": "2026-01-01T00:00:00.000Z" }
```

---

### 2. Readiness — `GET /health/ready`

**Purpose:** Confirms the pod can handle production traffic. Checks **only**
the critical internal dependencies: **PostgreSQL (Prisma)** and **Redis**.

**k8s probe type:** `readinessProbe`
**Failure action:** Pod is removed from the Service's load-balancer rotation.
No restart; the pod stays alive and rejoins when deps recover.

**Intentionally excluded:**
- Stellar Horizon RPC — external, degraded-but-tolerable
- Soroban RPC — external, degraded-but-tolerable
- IPFS/Pinata — optional, non-blocking
- On-chain indexer — lag is expected; not grounds to remove a pod

Including any of the above in readiness would cause a deploy storm during
Stellar RPC slowness, where all pods are simultaneously un-readied.

**Response (200 OK — ready):**
```json
{
  "status": "ready",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "checks": {
    "database": { "status": "up", "message": "Database connection healthy", "responseTime": 4 },
    "redis":    { "status": "up", "message": "Redis connection healthy",    "responseTime": 2 }
  }
}
```

**Response (503 — not ready):**
```json
{
  "status": "not_ready",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "checks": {
    "database": { "status": "down", "message": "Database check failed: ECONNREFUSED", "responseTime": 201 },
    "redis":    { "status": "up",   "message": "Redis connection healthy",              "responseTime": 2 }
  }
}
```

---

### 3. Startup — `GET /health/startup`

**Purpose:** Validates the minimum requirements for the container to enter
service. Checks DB, Redis, critical environment variables, and the
ADMIN_SECRET_KEY signing key. Run once on boot; replaced by liveness/readiness
after `initialDelaySeconds`.

**k8s probe type:** `startupProbe`
**Failure action:** Pod is killed if startup doesn't succeed within
`failureThreshold × periodSeconds`.

**Response (200 OK — ready):**
```json
{
  "status": "ready",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "checks": {
    "database":       { "status": "up", ... },
    "redis":          { "status": "up", ... },
    "config":         { "status": "up", ... },
    "adminSigningKey":{ "status": "up", ... }
  }
}
```

---

### 4. Full dependency check — `GET /health`

**Not a k8s probe.** Used by observability dashboards (Datadog, UptimeRobot,
Grafana) for the full dependency matrix including Stellar, IPFS, indexer, and
circuit-breaker states.

Returns `200` for `healthy` and `degraded`; `503` for `unhealthy`.

---

## Kubernetes Manifest Example

```yaml
# deployment.yaml (backend)
containers:
  - name: backend
    image: innov8/backend:latest
    ports:
      - containerPort: 4000

    # ── Startup probe ──────────────────────────────────────────────────────
    # Gives the app up to 30 s to initialise before liveness/readiness kick in.
    startupProbe:
      httpGet:
        path: /health/startup
        port: 4000
      failureThreshold: 6
      periodSeconds: 5
      timeoutSeconds: 3

    # ── Liveness probe ─────────────────────────────────────────────────────
    # Restarts the pod if the event loop is frozen.
    # Never checks external deps — must never fail due to Stellar/IPFS.
    livenessProbe:
      httpGet:
        path: /health/live
        port: 4000
      initialDelaySeconds: 0
      periodSeconds: 10
      failureThreshold: 3
      timeoutSeconds: 2

    # ── Readiness probe ────────────────────────────────────────────────────
    # Removes pod from LB rotation if DB or Redis are unavailable.
    # Does NOT check Stellar/IPFS/indexer — those are tolerable externals.
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 4000
      initialDelaySeconds: 0
      periodSeconds: 10
      failureThreshold: 3
      successThreshold: 1
      timeoutSeconds: 3
```

---

## Brownout Simulation

The tiered design was load-tested under the following failure scenarios:

| Scenario                        | `/health/live` | `/health/ready` | Pods in rotation? |
|---------------------------------|---------------|-----------------|-------------------|
| All healthy                     | 200 alive     | 200 ready       | Yes               |
| Stellar RPC slow (>5 s)         | 200 alive     | 200 ready       | **Yes** ✓         |
| IPFS unavailable                | 200 alive     | 200 ready       | **Yes** ✓         |
| Indexer lag >15 s               | 200 alive     | 200 ready       | **Yes** ✓         |
| DB connection refused           | 200 alive     | 503 not_ready   | No (correct)      |
| Redis connection refused        | 200 alive     | 503 not_ready   | No (correct)      |
| DB + Redis both down            | 200 alive     | 503 not_ready   | No (correct)      |
| Process frozen (liveness fails) | fails         | —               | Pod restarted     |

**Key insight:** Before this fix, `/health/ready` called `performHealthCheck()` which includes
Stellar/IPFS/indexer checks. A Stellar RPC brownout would fail readiness on all pods
simultaneously, causing a deploy storm. With `performReadinessCheck()` (DB+Redis only),
pods remain in rotation during external brownouts and degrade gracefully.

---

## Correlation ID Support

The `/health/detail` endpoint retains full correlation ID support via
`correlationIdMiddleware` registered in `app.ts`. All health responses include
the `X-Correlation-ID` header for distributed tracing.

---

## Canary Deployment Traffic Controls (Issue #561)

Canary releases for the backend and frontend shift traffic in **stages** and
**automatically roll back** when health or error-rate criteria are breached.
The canary relies on the probe tiers above: a canary pod that fails
`/health/ready` is never added to the traffic split, and a canary that starts
failing readiness mid-rollout is drained before the next stage.

### Staged traffic shifting

Traffic is shifted through a fixed ladder. Each stage holds for
`CANARY_STAGE_DURATION_SECONDS` before advancing, and only advances when the
canary passes the rollback criteria for the whole hold window.

| Stage | Backend weight | Frontend weight |
|-------|----------------|-----------------|
| 0     | 0%             | 0%              |
| 1     | 5%             | 10%             |
| 2     | 25%            | 25%             |
| 3     | 50%            | 50%             |
| 4     | 100%           | 100%            |

Weights are applied at the ingress/service mesh layer (e.g. an Istio
`VirtualService` or an nginx `split_clients` map). The canary is addressed by
its own Service (`backend-canary`, `frontend-canary`) so the stable Service is
never mutated until the final stage.

### Automated rollback criteria

A stage is aborted (traffic returns to 0% for the canary and the rollout is
marked failed) when **any** of the following holds during the hold window:

| Signal                         | Threshold (default)                  |
|--------------------------------|--------------------------------------|
| HTTP 5xx error rate            | > `CANARY_MAX_ERROR_RATE` (1%)       |
| p95 latency                    | > `CANARY_MAX_P95_LATENCY_MS` (800)  |
| Readiness failures             | any canary pod not ready > 30 s      |
| Liveness restarts              | > 0 restarts during the stage        |

Thresholds are evaluated against the canary cohort only, so a pre-existing
stable-version issue does not trigger a false rollback. On abort the previous
stable revision keeps 100% of traffic; no manual step is required.

### Configuration

All values are optional and read from the environment (see
`.env.example`); defaults are safe for production.

| Variable                          | Default | Description                                   |
|-----------------------------------|---------|-----------------------------------------------|
| `CANARY_ENABLED`                  | `false` | Master switch for staged rollouts             |
| `CANARY_STAGE_DURATION_SECONDS`   | `300`   | Hold time per stage before advancing          |
| `CANARY_MAX_ERROR_RATE`           | `0.01`  | 5xx rate (0–1) that triggers rollback         |
| `CANARY_MAX_P95_LATENCY_MS`       | `800`   | p95 latency ceiling for the canary cohort     |

### Failure states

- **Canary never becomes ready:** rollout aborts at stage 0; stable keeps 100%.
- **Metrics unavailable:** the stage does **not** advance (fail-closed) and the
  rollout is aborted after one hold window.
- **Partial stage failure:** traffic is reset to 0% for the canary before the
  failed revision is scaled down, so no in-flight requests are dropped.

Rollout logs record only stage index, weights, and aggregate metrics — never
request bodies, headers, or user identifiers — so no secrets or PII are emitted.
