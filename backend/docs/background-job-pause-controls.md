# Background job pause controls

Admin-only endpoints (behind `ADMIN_ROUTES_ENABLED`, auth + admin allowlist, CSRF) to pause
operationally risky scheduled jobs without a deploy.

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/admin/jobs` | Pause status of every controllable job |
| GET  | `/api/admin/jobs/:job/status` | `{ job, paused }` |
| POST | `/api/admin/jobs/:job/pause` | Stop workers picking up new jobs (all instances) |
| POST | `/api/admin/jobs/:job/resume` | Resume processing |

Controllable jobs: `reconciliation`, `treasury-reconciliation`, `pii-log-scan`,
`webhook-secret-purge`, `pilot-feedback-sla-check`.

Behaviour:
- Pause is a BullMQ queue-level pause stored in Redis, so it applies to every worker process and
  survives restarts. In-flight jobs finish; repeatable schedules keep enqueuing and run on resume.
- Unknown job → `404`. Redis/queue failure → `503 { error: "Job queue unavailable" }` (no internals leaked).
- Every pause/resume is logged at `warn` with the admin wallet and correlation ID.

## Correlation IDs across async boundaries

Use `src/lib/correlation.ts` to keep the request's `x-correlation-id` across jobs and outbound calls:
`withCorrelationId(data, req.correlationId)` when enqueueing, `getJobCorrelationId(job.data)` in the
worker, and `correlationHeaders(id)` on outbound webhook/external HTTP calls. Unsafe IDs are dropped.
