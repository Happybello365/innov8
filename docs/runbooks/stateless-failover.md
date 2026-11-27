# Stateless Service Failover Rehearsal

Rehearse losing one backend replica and confirm the stateless tier recovers
within budget. Run it against staging before a release that changes the
backend deployment, and after any change to probes, replica counts or PDBs.

## Target and replicas

- Deployment: `backend` in `infra/k8s/backend-deployment.yaml` (2 replicas, label `app=backend`).
- Probe target: the backend readiness endpoint, `GET /health/ready`.
- Frontend (`infra/k8s/frontend-deployment.yaml`) is stateless and can be rehearsed the same way with its own URL.

## Data dependencies

Stateless replicas hold no data. Failover only succeeds if these shared
dependencies stay reachable while a pod is replaced:

| Dependency | Config | Failover note |
|---|---|---|
| Postgres | `DATABASE_URL` (`postgres-statefulset.yaml`) | Single stateful set. A replica loss does not affect it, but connection pools must reconnect on the new pod. |
| Redis | `REDIS_PASSWORD` (`redis-deployment.yaml`) | Used for rate limits and caching. See [redis-maintenance.md](./redis-maintenance.md) for degraded-mode behavior. |
| Stellar / Soroban RPC | `STELLAR_RPC_URL` | External. Not covered by this rehearsal; RPC incidents are tracked under [synthetic-probes-policy.md](../synthetic-probes-policy.md). |
| IPFS (Pinata) | Pinata credentials in `innov8-secrets` | External. Evidence upload fails independently of replica health. |

A failover pass therefore means "the stateless tier recovered", not "every
dependency is healthy". Check the dependencies separately if the probe fails
after the pod is replaced.

## Running the rehearsal

```bash
TARGET_URL=https://staging.example.com/health/ready \
DISRUPT_CMD="kubectl delete pod -l app=backend --wait=false | head -n1" \
PROBE_DURATION_S=90 \
./scripts/stateless-failover-test.sh
```

Environment variables (defaults in parentheses): `PROBE_INTERVAL_S` (1),
`DISRUPT_AFTER_S` (5), `PROBE_DURATION_S` (60), `MAX_FAILURE_RATIO` (0.05),
`RECOVERY_S` (30).

Exit `0` means the failure ratio stayed within budget and the service recovered.
Exit `1` means the budget was exceeded, the service did not recover, or the
configuration was invalid.

## Pass criteria

1. The target returns `200` before the disruption.
2. The failed-probe ratio during the window is at most `MAX_FAILURE_RATIO`.
3. The target returns `200` within `RECOVERY_S` after the disruption ends.

## When it fails

- **Ratio exceeded but recovered:** check the pod disruption budget and
  readiness probe timing in `backend-deployment.yaml`. Consider `maxUnavailable: 0`.
- **No recovery:** follow [incident-response.md](./incident-response.md). Check
  Postgres and Redis reachability first, then the rollout status
  (`kubectl rollout status deploy/backend`).
- Roll back the deployment with [rollback.md](./rollback.md) if the regression came from a recent release.
