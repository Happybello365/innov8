# Backend

This directory contains the innov8 backend services (API, workers, and shared
libraries) that power the agricultural escrow platform.

## Setup

1. Install dependencies for the backend stack.
2. Copy the environment example to `.env` and fill in local values.
3. Start the API and worker processes using the repository's standard scripts.

Refer to the top-level `README.md` for the full setup instructions and the
list of supported stacks.

## Testing

Run the smallest relevant stack test command during development. The backend
test suite covers unit, integration, authorization, and failure-path scenarios.

## Security: cross-tenant authorization

The backend enforces tenant isolation on every resource. Trade, dispute, vault,
and admin resources are scoped to the requesting party's tenant; a request that
references a resource owned by another tenant must be rejected.

### Cross-tenant authorization fuzz suite

The backend includes a fuzz suite that probes cross-tenant access to trade,
dispute, vault, and admin resources. It generates cross-party requests
(mismatched tenant/party identifiers, malformed IDs, missing resources, and
unauthorized roles) and asserts that:

- Cross-tenant reads and writes are denied with `403` (forbidden) or `404`
  (not found) — never `200` with another tenant's data.
- Denials do not leak secrets, tokens, or PII in response bodies, headers, or
  error messages.
- Missing resources and malformed identifiers fail closed without revealing
  whether a resource exists in another tenant.
- Unauthorized roles are rejected consistently across all four resource types.

Run the suite with the backend test command targeting the authorization fuzz
tests. It is safe to run locally against seeded test data and is part of the
CI gate for the backend stack.

### Reporting issues

If the fuzz suite surfaces a cross-tenant leak, treat it as a security issue:
do not include tenant data, secrets, or PII in the report. Reference the failing
resource type and the assertion that failed only.

