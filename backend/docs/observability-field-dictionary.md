# Observability Field Dictionary

This dictionary defines the shared vocabulary for correlation IDs, trace/span names,
metric labels, and cardinality limits across all Amana backend services. Use it together
with the related docs:

- [Tail-based trace sampling](./tail-based-trace-sampling.md)
- [Business KPI metrics](./business-kpi-metrics.md)
- [Health probe semantics](./health-probe-semantics.md)
- [PII log scanning](./pii-log-scanning.md)

Tracing is configured via `backend/.env.tracing.example` (see `OTEL_*` variables).

## Correlation IDs

| Field | Type | Where | Description |
| --- | --- | --- | --- |
| `trace_id` | 32-char lowercase hex | OTel span context | W3C trace identifier; primary correlation key. |
| `span_id` | 16-char lowercase hex | OTel span context | Identifier of the current span. |
| `request_id` | UUID v4 | `x-request-id` header, logs, spans | Per-HTTP-request correlation ID. Generated if absent. |
| `trade_id` | UUID | logs, spans, metrics | Amana trade identifier; ties work to an escrow. |
| `user_id` | opaque UUID | logs, spans | Internal user identifier. Never log wallet addresses, emails, or names. |

Rules:

- Propagate `traceparent` (W3C) on all outbound calls; never invent a new trace per hop.
- Echo the inbound `x-request-id` back on the response; generate one when missing.
- Correlation IDs are opaque. Do not embed PII, secrets, or wallet keys in any ID.

## Trace and span naming

- Trace (root span) name: `<service>.<operation>` — e.g. `backend.http.request`,
  `backend.trade.settle`, `backend.pathpayment.quote`.
- Child span name: `<component>.<action>` — e.g. `prisma.query`, `stellar.submit`,
  `pinata.upload`, `supabase.fetch`.
- Use lowercase dot-separated segments; no spaces, no dynamic values in names.
- Put variable data (trade IDs, amounts) in span attributes, not in the span name.
- Span attributes follow OpenTelemetry semantic conventions where they exist
  (`http.method`, `http.status_code`, `db.system`, `messaging.system`).

## Metric labels

Allowed label keys (keep the set small and bounded):

| Label | Example | Notes |
| --- | --- | --- |
| `service` | `backend` | Fixed per deployment. |
| `operation` | `trade.settle` | Must be from a fixed enum. |
| `status` | `ok`, `error`, `timeout` | Fixed enum. |
| `route` | `/trades/:id/settle` | Templated route, never the raw path. |
| `method` | `POST` | HTTP verb. |
| `outcome` | `success`, `failure` | Business outcome for KPI metrics. |

Never use as labels: `trace_id`, `span_id`, `request_id`, `trade_id`, `user_id`,
wallet addresses, amounts, timestamps, or any unbounded value.

## Cardinality limits

- Maximum distinct values per label: **50**. Anything higher must be bucketed or moved
  to span attributes / logs.
- Maximum total label combinations per metric: **1,000**. Exceeding this is a bug.
- Route labels must be templated (`/trades/:id`), not concrete (`/trades/abc123`).
- If a label would exceed its limit, drop the label and record the value in the span
  instead; never let cardinality grow unbounded.

## Edge cases and failure states

- **Missing `x-request-id`**: generate a UUID v4, attach it to the span and logs, and
  return it in the response header.
- **Invalid `x-request-id`** (not a UUID): replace with a generated ID; do not reject the
  request. Log a `warn` without echoing the invalid value.
- **Missing trace context**: start a new root span; do not fail the request.
- **Sampling interaction**: correlation IDs are always recorded regardless of sampling;
  sampled-out spans still carry `trace_id`/`request_id` in logs. See
  [tail-based trace sampling](./tail-based-trace-sampling.md).
- **Label overflow**: when a label exceeds its cardinality limit, drop the label rather
  than emitting a new series; alert on the drop counter.
- **PII safety**: correlation IDs and labels must never contain wallet addresses, emails,
  names, or secrets. See [PII log scanning](./pii-log-scanning.md).
