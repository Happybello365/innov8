#!/usr/bin/env bash
# stateless-failover-test.sh — rehearsable failover test for stateless services (#566).
#
# Probes a service's readiness endpoint at a fixed interval while a disruption
# command removes one replica (e.g. `kubectl delete pod`). Passes when the
# failure ratio during the disruption stays under MAX_FAILURE_RATIO and the
# service is healthy again within RECOVERY_S after the disruption ends.
#
# Data dependencies that must remain reachable during failover are listed in
# docs/runbooks/stateless-failover.md. This script only proves the stateless
# tier recovers; it does not touch Postgres, Redis or the RPC provider.
#
# Usage:
#   TARGET_URL=https://staging.example.com/health/ready \
#   DISRUPT_CMD='kubectl delete pod -l app=backend --field-selector=status.phase=Running --wait=false | head -n1' \
#   ./scripts/stateless-failover-test.sh
#
# Env:
#   TARGET_URL          required; readiness URL to probe
#   DISRUPT_CMD         required; command that disrupts one replica
#   PROBE_INTERVAL_S    seconds between probes (default 1)
#   DISRUPT_AFTER_S     warm-up probes before disruption (default 5)
#   PROBE_DURATION_S    total probe window (default 60)
#   MAX_FAILURE_RATIO   allowed failed-probe fraction during the window (default 0.05)
#   RECOVERY_S          max seconds to become healthy after disruption (default 30)
#
# Exit codes:
#   0 — failover within budget
#   1 — budget exceeded, no recovery, or misconfiguration
set -euo pipefail

: "${TARGET_URL:?TARGET_URL is required}"
: "${DISRUPT_CMD:?DISRUPT_CMD is required}"
PROBE_INTERVAL_S="${PROBE_INTERVAL_S:-1}"
DISRUPT_AFTER_S="${DISRUPT_AFTER_S:-5}"
PROBE_DURATION_S="${PROBE_DURATION_S:-60}"
MAX_FAILURE_RATIO="${MAX_FAILURE_RATIO:-0.05}"
RECOVERY_S="${RECOVERY_S:-30}"

probe() {
  local code
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$TARGET_URL" || true)"
  [[ "$code" == "200" ]]
}

echo "Target: $TARGET_URL"
echo "Probing every ${PROBE_INTERVAL_S}s for ${PROBE_DURATION_S}s; disruption after ${DISRUPT_AFTER_S}s."

if ! probe; then
  echo "FAIL: target is not healthy before disruption" >&2
  exit 1
fi

total=0
failed=0
disrupt_pid=""
disrupt_start=-1
disrupt_end=-1
start_ts=$SECONDS

while (( SECONDS - start_ts < PROBE_DURATION_S )); do
  elapsed=$(( SECONDS - start_ts ))

  if [[ -z "$disrupt_pid" ]] && (( elapsed >= DISRUPT_AFTER_S )); then
    echo "-> disruption started at t=${elapsed}s"
    disrupt_start=$elapsed
    bash -c "$DISRUPT_CMD" &
    disrupt_pid=$!
  fi

  if [[ -n "$disrupt_pid" && $disrupt_end -lt 0 ]] && ! kill -0 "$disrupt_pid" 2>/dev/null; then
    wait "$disrupt_pid" || { echo "FAIL: disruption command exited non-zero" >&2; exit 1; }
    disrupt_end=$elapsed
    echo "-> disruption finished at t=${elapsed}s"
  fi

  total=$(( total + 1 ))
  if probe; then
    :
  else
    failed=$(( failed + 1 ))
  fi
  sleep "$PROBE_INTERVAL_S"
done

if [[ -n "$disrupt_pid" && $disrupt_end -lt 0 ]]; then
  wait "$disrupt_pid" || { echo "FAIL: disruption command exited non-zero" >&2; exit 1; }
  disrupt_end=$(( SECONDS - start_ts ))
fi

if [[ -z "$disrupt_pid" ]]; then
  echo "FAIL: probe window ended before disruption started; raise PROBE_DURATION_S" >&2
  exit 1
fi

recovered=0
rec_start=$SECONDS
while (( SECONDS - rec_start < RECOVERY_S )); do
  if probe; then recovered=1; break; fi
  sleep "$PROBE_INTERVAL_S"
done

ratio="$(awk -v f="$failed" -v t="$total" 'BEGIN { printf "%.4f", (t ? f / t : 0) }')"
echo "Probes: total=$total failed=$failed ratio=$ratio (budget $MAX_FAILURE_RATIO)"

if (( recovered == 0 )); then
  echo "FAIL: service did not recover within ${RECOVERY_S}s" >&2
  exit 1
fi
if awk -v r="$ratio" -v m="$MAX_FAILURE_RATIO" 'BEGIN { exit !(r > m) }'; then
  echo "FAIL: failure ratio $ratio exceeds budget $MAX_FAILURE_RATIO" >&2
  exit 1
fi

echo "PASS: failover within budget (disruption t=${disrupt_start}s..${disrupt_end}s)"
