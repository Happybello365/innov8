# Cost anomaly and budget alerts

Prometheus alerts in
[`infra/prometheus/cost-alerting-rules.yml`](../infra/prometheus/cost-alerting-rules.yml)
watch recurring costs for the database, RPC, storage, CDN, and mobile builds.
Load this file alongside the existing SLO rules in the Prometheus rules
configuration, and route the resulting `category=cost` alerts through
Alertmanager.

## Billing metric contract

Cost providers do not share one billing API, so provider-specific billing
adapters must normalize their output into these Prometheus metrics:

| Metric | Type / units | Required labels | Meaning |
|---|---|---|---|
| `service_cost_usd_total` | Counter, USD | `service` | Current-month spend; reset at 00:00 UTC on the first day of each month. |
| `service_monthly_cost_budget_usd` | Gauge, USD | `service` | Configured monthly budget, greater than zero. |

Use exactly one series per service, with `service` set to one of
`database`, `rpc`, `storage`, `cdn`, or `mobile_build`. If a provider reports
multiple line items, aggregate them in the adapter before exposing the
metrics. Convert amounts to USD there; do not attach account IDs, project
names, endpoint URLs, credentials, or other identifying labels.

Rules define those five service categories as expected inputs. Missing spend
data, a missing budget, or a zero/negative budget each produces a ticket alert.

The database, storage, and CDN adapters should include all relevant billed
resources (for example RDS, S3, and CloudFront). RPC and mobile-build adapters
must use their providers' billing or usage exports; this rules file does not
assume those third-party services are billed by AWS.

## Alert behavior

- At 80% of a configured monthly budget, a ticket alert fires after one hour.
- At 100%, a ticket alert fires after 30 minutes.
- A 7-day spend increase of at least 50% and at least $5 versus the previous
  7-day period fires after six hours. The absolute floor suppresses small
  fluctuations; adjust it in the alert rule to match the billing scale.
- If a service has a budget but its current-month spend metric disappears for
  an hour, a missing-metrics ticket fires instead of silently treating the
  service as free. A budget missing for any expected category also alerts.
- The rolling anomaly comparison needs 14 days of counter history. Budget
  alerts are available as soon as the metrics are being scraped.

All alerts are routed as tickets rather than pages to avoid paging on billing
noise. The payload contains only the service category and spend value; it
does not include provider account identifiers or billing records.

## Rollout

1. Configure each provider adapter to publish both metrics for each of the
   five service labels, and add its scrape target to Prometheus.
2. Set budgets from the approved finance/operations limits; do not copy
   example amounts into production.
3. Load `cost-alerting-rules.yml` and add a test alert in a non-production
   environment to confirm the `category=cost` Alertmanager route and receiver.
4. Follow [the cost anomaly runbook](runbooks/cost-anomaly.md) when a cost or
   data-quality alert fires.
