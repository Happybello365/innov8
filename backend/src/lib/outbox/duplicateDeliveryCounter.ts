/**
 * Outbox duplicate-delivery counter (issue #464).
 *
 * Counts event deliveries that were suppressed by downstream idempotency
 * guards (ProcessedEvent unique constraint, already-PROCESSED outbox rows).
 * A non-zero, growing count means the source re-delivered an event and the
 * idempotency layer correctly absorbed it; it never contains payloads or PII.
 */

export type DuplicateDeliverySource =
  | "processed_event_conflict"
  | "outbox_already_processed";

export interface DuplicateDeliverySnapshot {
  total: number;
  bySource: Record<DuplicateDeliverySource, number>;
  byEventType: Record<string, number>;
  lastDetectedAt: string | null;
}

export class DuplicateDeliveryCounter {
  private total = 0;
  private bySource: Record<DuplicateDeliverySource, number> = {
    processed_event_conflict: 0,
    outbox_already_processed: 0,
  };
  private byEventType = new Map<string, number>();
  private lastDetectedAt: Date | null = null;

  record(source: DuplicateDeliverySource, eventType = "unknown", now: Date = new Date()): void {
    this.total += 1;
    this.bySource[source] += 1;
    const key = eventType || "unknown";
    this.byEventType.set(key, (this.byEventType.get(key) ?? 0) + 1);
    this.lastDetectedAt = now;
  }

  snapshot(): DuplicateDeliverySnapshot {
    return {
      total: this.total,
      bySource: { ...this.bySource },
      byEventType: Object.fromEntries(this.byEventType),
      lastDetectedAt: this.lastDetectedAt ? this.lastDetectedAt.toISOString() : null,
    };
  }

  reset(): void {
    this.total = 0;
    this.bySource = { processed_event_conflict: 0, outbox_already_processed: 0 };
    this.byEventType.clear();
    this.lastDetectedAt = null;
  }
}

export const duplicateDeliveryCounter = new DuplicateDeliveryCounter();
