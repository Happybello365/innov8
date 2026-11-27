"use client";

import { summarizeQueuedActions, describeQueuedActionBreakdown } from "@/lib/offlineQueueSummary";
import type { QueuedAction } from "@/stores/offlineQueueStore";

export interface QueuedActionsSummaryProps {
  queue: readonly QueuedAction[];
  className?: string;
}

/**
 * Shows how many actions are held on this device.
 *
 * Wording is deliberate: these are queued, not submitted. The user must not be
 * told a trade, deposit or release went through until the server confirms it.
 */
export function QueuedActionsSummary({ queue, className }: QueuedActionsSummaryProps) {
  const summary = summarizeQueuedActions(queue);
  if (summary.total === 0) return null;

  const noun = summary.total === 1 ? "action" : "actions";
  const breakdown = describeQueuedActionBreakdown(summary);

  return (
    <span
      data-testid="queued-actions-summary"
      className={className ?? "inline-flex flex-wrap items-center gap-2 text-xs"}
    >
      <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">
        {summary.total} {noun} queued
      </span>
      <span>{breakdown}. Not submitted yet.</span>
    </span>
  );
}
