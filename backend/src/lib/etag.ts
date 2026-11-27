/**
 * ETag helpers for conditional HTTP requests (#453).
 *
 * Generates a deterministic, weak ETag from a resource's version/updatedAt so
 * read-heavy trade and dispute endpoints can respond with 304 Not Modified
 * instead of re-sending the full payload when nothing has changed.
 *
 * We use weak ETags (`W/"..."`) because:
 *   - Our resources are JSON — the byte representation may differ across
 *     serialisers while the logical content is identical.
 *   - RFC 7232 §2.1 recommends weak ETags for semantic equivalence.
 *
 * Generating:
 *   - For versioned Prisma resources (Trade, Dispute) the ETag encodes
 *     both the resource id and the `version` / `updatedAt` so a concurrent
 *     update always produces a different token.
 *   - `computeETag(id, version, updatedAt)` is the canonical function.
 *
 * Checking:
 *   - `checkConditionalRequest(req, etag)` returns `true` when the client's
 *     `If-None-Match` header matches the current ETag. The caller should
 *     respond 304 and return early.
 */

import crypto from "crypto";
import type { Request } from "express";

/**
 * Computes a weak ETag for a resource identified by `resourceId` with the
 * given `version` counter and `updatedAt` timestamp.
 *
 * The token is a short SHA-256 hex prefix — collision probability is
 * negligible at the scale of individual resource records.
 */
export function computeETag(
  resourceId: string | number,
  version: number | undefined,
  updatedAt: Date | string,
): string {
  const input = `${String(resourceId)}:${version ?? 0}:${new Date(updatedAt).getTime()}`;
  const hash = crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

/**
 * Returns `true` when the caller sent an `If-None-Match` header that matches
 * `currentETag`, meaning the client already has a fresh copy of the resource
 * and the server should respond 304 Not Modified.
 *
 * Handles the wildcard `*` value (matches any ETag) but we treat it as a
 * cache-miss since `*` is only meaningful in conditional writes (PUT/DELETE).
 */
export function checkConditionalRequest(req: Request, currentETag: string): boolean {
  const ifNoneMatch = req.headers["if-none-match"];
  if (!ifNoneMatch || ifNoneMatch === "*") return false;
  // The header may carry a comma-separated list of ETags.
  const clientTags = ifNoneMatch.split(",").map((t) => t.trim());
  return clientTags.includes(currentETag);
}
