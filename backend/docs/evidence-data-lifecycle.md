# Evidence Data Lifecycle Guide

## Overview

Dispute evidence (photos, receipts, delivery confirmations, signed manifests)
is the most sensitive data the backend handles: it can contain PII, it must
survive long enough to settle a dispute, and it must be reachable by the
right parties during an active dispute — but not forever, and not by
anyone else. This guide documents the full lifecycle: collection, IPFS
storage, retention, deletion, and dispute access.

Related: [PII log scrubbing](pii-log-scanning.md) covers the log-store leak
surface; this covers the evidence store itself.

## 1. Collection

- Evidence is uploaded through the existing dispute/manifest endpoints and
  is always attached to a `tradeId` (and, when applicable, a `disputeId`).
  Evidence with no parent trade is rejected at validation time.
- Uploads are validated for content type and size before anything is
  persisted; rejected uploads are never written to IPFS.
- Evidence metadata (uploader, trade, dispute, content hash, timestamp) is
  stored in the database; the bytes themselves live in IPFS (below).
- Do not log evidence contents or full metadata records — see the
  structured-logging guidance in [pii-log-scanning.md](pii-log-scanning.md).

## 2. IPFS storage

- Evidence bytes are pinned to IPFS and referenced by CID from the database
  record. The CID is the durable handle; the DB row is the index.
- Pinning is best-effort at upload time. If the pin fails, the upload is
  reported as failed to the caller and no DB record is created — a record
  pointing at an unpinned CID is worse than a clean failure.
- If a pin is later found to be missing (garbage-collected by the pinning
  provider), the record is flagged and the uploader is asked to re-upload;
  the CID is never silently rewritten.
- CIDs are content-addressed, so re-uploading identical bytes yields the
  same CID and is idempotent.

## 3. Retention

- Evidence is retained for the life of the trade plus the dispute
  resolution window, then becomes eligible for deletion.
- The retention window is configured at the deployment level; the app-level
  precedent for PII retention in this codebase is
  `MANIFEST_PII_RETENTION_DAYS` (default 30 days). Evidence retention should
  be set to at least the dispute-resolution window and no longer than
  operationally necessary.
- Retention is enforced by a scheduled cleanup job, not by ad-hoc manual
  deletion, so the policy is auditable and consistent.

## 4. Deletion

- Deletion removes the DB record and unpins the CID. Unpinning is
  best-effort: if the unpin call fails, the record is still removed and the
  orphaned pin is left for the provider's garbage collection — deletion is
  never blocked on a flaky pinning provider.
- Deletion is refused while a dispute referencing the evidence is open.
  Once the dispute is resolved and the retention window has elapsed, the
  evidence becomes eligible again.
- Deletion events are recorded (who/when/which CID) for audit, without
  copying the evidence contents into the audit log.

## 5. Dispute access

- During an active dispute, evidence is readable by the dispute parties
  (buyer, seller, arbiter) and by support staff acting on the dispute.
  Access is scoped to the dispute — a party to one dispute cannot read
  evidence from another.
- Access checks happen server-side on every read; CIDs are not treated as
  capability tokens (a leaked CID must not grant access on its own).
- Access to evidence for a resolved dispute follows the same retention
  rules as the evidence itself: readable until deletion, then gone.

## Edge cases and failure states

| Situation | Behavior |
| --- | --- |
| IPFS pin fails at upload | Upload reported as failed; no DB record created |
| CID missing from IPFS later | Record flagged; uploader asked to re-upload; CID not rewritten |
| Deletion requested during open dispute | Refused; retried after resolution + retention window |
| Unpin fails during deletion | DB record removed; orphaned pin left to provider GC |
| Evidence referenced by a trade with no dispute | Retained for the trade lifetime, then eligible for cleanup |
| Unauthorized read attempt | Rejected server-side; no CID or contents returned |

## Guidance for contributors

- Never log evidence contents, CIDs alongside PII, or full metadata
  records — log the specific ids you need to debug.
- Treat the CID as an internal handle, not a shareable link; access is
  always checked against the dispute.
- If you add a new evidence type, wire it through the same
  collection → pin → retain → delete path rather than a bespoke flow.
