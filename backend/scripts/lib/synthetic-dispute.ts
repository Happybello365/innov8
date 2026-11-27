/**
 * Pure helpers for the synthetic dispute journey (#565). Kept out of
 * staging-synthetic-probe.ts so they can be unit-tested without running the probe.
 */

/** Trade statuses accepted as the settlement outcome after a dispute is resolved. */
export const SETTLEMENT_OUTCOME_STATUSES = ["COMPLETED", "CANCELLED", "DISPUTED"] as const;

/** Returns the dispute id for `tradeId` from the mediator's `GET /disputes` payload. */
export function findDisputeIdForTrade(payload: unknown, tradeId: string): string {
  const body = payload as { items?: unknown; data?: unknown } | null;
  const items: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(body?.items)
      ? (body!.items as unknown[])
      : Array.isArray(body?.data)
        ? (body!.data as unknown[])
        : [];
  for (const item of items) {
    const row = item as { id?: string; tradeId?: string };
    if (row.tradeId === tradeId && row.id) return row.id;
  }
  throw new Error(`No mediator dispute found for trade ${tradeId}`);
}
