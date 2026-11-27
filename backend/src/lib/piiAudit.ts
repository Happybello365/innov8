import { appLogger } from "../middleware/logger";

export interface PiiAccessContext {
  /** Table/model holding the encrypted column, e.g. "DeliveryManifest" */
  resource: string;
  /** Primary key or trade identifier the encrypted row belongs to */
  recordId: string;
  /** Column(s) that were decrypted */
  fields: string[];
  /** Wallet address / identity of the caller that triggered the decrypt */
  actor: string;
  /** Why the decrypt happened, e.g. "manifest.view" */
  action: string;
}

/**
 * Writes a durable, structured audit log entry every time PII ciphertext is
 * decrypted. This is the "access logging on decrypt operations" control
 * required by the PII-at-rest encryption policy (docs/pii-encryption.md) —
 * it lets us answer "who read this driver's identity and when" without
 * touching application state or slowing down the decrypt path.
 *
 * Mirrors the structured-audit pattern used for escrow events in
 * `lib/escrowAudit.ts` so log aggregators can filter on `audit: true` and
 * `auditType` uniformly.
 */
export function logPiiAccess(ctx: PiiAccessContext): void {
  const timestamp = new Date().toISOString();
  rememberPiiAccess({ ...ctx, fields: [...ctx.fields], timestamp });
  appLogger.info(
    {
      audit: true,
      auditType: "pii-decrypt",
      resource: ctx.resource,
      recordId: ctx.recordId,
      fields: ctx.fields,
      actor: ctx.actor,
      action: ctx.action,
      timestamp,
    },
    `[PiiAudit] decrypt ${ctx.resource}.[${ctx.fields.join(",")}] by ${ctx.actor}`,
  );
}

/** A single recorded PII decrypt, as returned by `queryPiiAccess`. */
export interface PiiAccessRecord extends PiiAccessContext {
  timestamp: string;
}

export interface PiiAccessQuery {
  actor?: string;
  resource?: string;
  recordId?: string;
  action?: string;
  /** ISO timestamp; only records at or after this instant are returned. */
  since?: string;
  limit?: number;
}

/** Maximum decrypt records retained in-process (oldest evicted first). */
export const PII_ACCESS_BUFFER_SIZE = 1000;
/** Default and hard upper bound on records returned by a single query. */
export const PII_ACCESS_DEFAULT_LIMIT = 50;
export const PII_ACCESS_MAX_LIMIT = 200;

let piiAccessBuffer: PiiAccessRecord[] = [];

function rememberPiiAccess(record: PiiAccessRecord): void {
  piiAccessBuffer.push(record);
  if (piiAccessBuffer.length > PII_ACCESS_BUFFER_SIZE) {
    piiAccessBuffer = piiAccessBuffer.slice(piiAccessBuffer.length - PII_ACCESS_BUFFER_SIZE);
  }
}

/**
 * Bounded audit query over recent PII decrypts, newest first. Only metadata
 * (resource, record id, field names, actor, reason) is retained — never the
 * plaintext. Process-local: for fleet-wide history query the log aggregator
 * on `auditType: "pii-decrypt"`.
 */
export function queryPiiAccess(query: PiiAccessQuery = {}): {
  items: PiiAccessRecord[];
  limit: number;
} {
  const requested = Number.isFinite(query.limit) ? Math.trunc(query.limit as number) : PII_ACCESS_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(requested, 1), PII_ACCESS_MAX_LIMIT);
  const sinceMs = query.since ? Date.parse(query.since) : NaN;

  const items: PiiAccessRecord[] = [];
  for (let i = piiAccessBuffer.length - 1; i >= 0 && items.length < limit; i--) {
    const r = piiAccessBuffer[i];
    if (query.actor && r.actor !== query.actor) continue;
    if (query.resource && r.resource !== query.resource) continue;
    if (query.recordId && r.recordId !== query.recordId) continue;
    if (query.action && r.action !== query.action) continue;
    if (!Number.isNaN(sinceMs) && Date.parse(r.timestamp) < sinceMs) continue;
    items.push({ ...r, fields: [...r.fields] });
  }
  return { items, limit };
}

/** Test-only: reset the decrypt audit buffer. */
export function __clearPiiAccessForTests(): void {
  piiAccessBuffer = [];
}
