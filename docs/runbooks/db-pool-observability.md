# Supabase connection pool observability

The backend reads Prisma's built-in pool metrics (the `metrics` preview feature
in `backend/prisma/schema.prisma`) every 15 s (`backend/src/lib/dbPoolMetrics.ts`).
It reports only aggregate counts. Connection strings, hosts and credentials are
never included.

## Where to look

- **`GET /health/detail`** → the `dbPool` block:
  `status`, `connectionLimit`, `open`, `busy`, `idle`, `waiting`,
  `saturation`, `checkoutWaitAvgMs`, `checkoutWaitCount`, `collectedAt`.
  If metrics can't be collected, `status` is `"unavailable"` and the health check still returns.
- **Prometheus** (OpenTelemetry exporter) gauges:

| Metric | Meaning |
| --- | --- |
| `db_pool_connections_open` | Open connections in the pool |
| `db_pool_connections_busy` | Connections currently checked out |
| `db_pool_connections_idle` | Idle connections |
| `db_pool_queries_waiting` | Queries waiting for a free connection |
| `db_pool_saturation_ratio` | `busy / connection_limit` (0–1) |
| `db_pool_checkout_wait_avg_ms` | Mean time spent waiting to check out a connection |

## Configuration

The pool size is taken from `connection_limit` on `DATABASE_URL`, for example
`...?pgbouncer=true&connection_limit=20` when using the Supabase pooler. If it
isn't set, Prisma's default (`cpus * 2 + 1`) applies, and saturation is
calculated against that default.

## Suggested alerts

- `db_pool_saturation_ratio > 0.9` for 5 min: the pool is close to exhausted. Raise `connection_limit` (within the Supabase plan's limit) or look for long transactions.
- `db_pool_queries_waiting > 0` sustained, or `db_pool_checkout_wait_avg_ms` rising: requests are queueing for connections. Check for slow queries (`scripts/capture-slow-queries.sh`).
