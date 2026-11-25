# Runbook: cost anomaly and budget alerts

Use this runbook for alerts from
[`infra/prometheus/cost-alerting-rules.yml`](../../infra/prometheus/cost-alerting-rules.yml).
All are ticket-severity alerts and should be triaged the same business day.

## Triage

1. Check the alert's `service` label (`database`, `rpc`, `storage`, `cdn`, or
   `mobile_build`) and confirm the provider's billing/usage report for the
   matching UTC period.
2. Compare the latest invoice line items and usage with the prior 7 days.
   Look for changes in request volume, data transfer, storage growth, database
   sizing, RPC request tiers, or mobile build minutes.
3. Verify that the billing adapter converts amounts to USD, emits one series
   per service, and resets its monthly counter only at the start of the UTC
   month.
4. If the alert is a missing-metrics alert, inspect the provider export,
   adapter, and Prometheus scrape health. Do not treat absent data as zero
   spend.
5. If the increase is expected, record the reason and update the budget only
   with the budget owner's approval. Otherwise, pause or reduce the source of
   spend where safe, then escalate to the service owner.

## Alert-specific notes

- **Budget warning / exceeded:** the value is the current-month spend divided
  by the configured monthly budget. Confirm billing lag before taking
  irreversible action.
- **Cost anomaly:** the rolling 7-day spend is at least 50% and $5 above the
  preceding 7-day window. Check whether the workload or provider pricing
  changed.
- **Metrics missing:** Prometheus no longer sees a current-month spend series
  for an expected service. Restore telemetry before deciding whether spend is
  within budget.
- **Budget missing / invalid:** configure a positive monthly USD budget for
  the named service category; budget alerts are disabled until that value is
  present and valid.

Do not paste invoices, account identifiers, credentials, customer data, or
provider URLs into alert comments or incident channels.
