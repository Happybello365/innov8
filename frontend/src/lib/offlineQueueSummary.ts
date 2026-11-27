import type { QueuedAction, QueuedActionType } from "@/stores/offlineQueueStore";

/**
 * Pure summary of the offline queue for display.
 *
 * Queued actions are only *held locally*. Nothing here means a request reached
 * the server, so callers must not describe these as sent or submitted.
 */

export interface QueuedActionTypeCount {
  type: QueuedActionType;
  label: string;
  count: number;
}

export interface QueuedActionSummary {
  total: number;
  byType: QueuedActionTypeCount[];
}

const TYPE_LABELS: Record<QueuedActionType, { singular: string; plural: string }> = {
  "create-trade": { singular: "trade", plural: "trades" },
  deposit: { singular: "deposit", plural: "deposits" },
  release: { singular: "release", plural: "releases" },
  dispute: { singular: "dispute", plural: "disputes" },
  manifest: { singular: "manifest", plural: "manifests" },
};

const TYPE_ORDER: QueuedActionType[] = ["create-trade", "deposit", "release", "dispute", "manifest"];

export function summarizeQueuedActions(queue: readonly QueuedAction[]): QueuedActionSummary {
  const counts = new Map<QueuedActionType, number>();
  for (const action of queue) {
    counts.set(action.type, (counts.get(action.type) ?? 0) + 1);
  }

  const byType: QueuedActionTypeCount[] = TYPE_ORDER.filter((type) => counts.has(type)).map((type) => {
    const count = counts.get(type) ?? 0;
    const labels = TYPE_LABELS[type];
    return { type, count, label: count === 1 ? labels.singular : labels.plural };
  });

  return { total: queue.length, byType };
}

/** Human-readable breakdown, e.g. "2 deposits, 1 release". Empty string when nothing is queued. */
export function describeQueuedActionBreakdown(summary: QueuedActionSummary): string {
  return summary.byType.map((entry) => `${entry.count} ${entry.label}`).join(", ");
}
