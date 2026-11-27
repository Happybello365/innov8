"use client";

/**
 * DisputeTimeline (#487)
 *
 * A chronological, screen-reader-friendly view of dispute state changes.
 *
 * Accessibility features:
 * - Rendered as an ordered list (`<ol>`) with role="list" and
 *   aria-label="Dispute timeline" so VoiceOver / NVDA announce it correctly.
 * - Each entry is an `<li>` with a visually-hidden status text so AT reads
 *   "Step 1 of 4: Dispute opened, completed, 14 May 2026 at 10:00 AM" rather
 *   than just the visible label.
 * - The decorative connector line and status dot carry aria-hidden.
 * - `<time dateTime={isoString}>` wraps every timestamp for machine-readable
 *   date semantics.
 * - Live region: an `aria-live="polite"` region at the top announces status
 *   updates when the dispute is still OPEN or UNDER_REVIEW (the active state
 *   is not yet final).
 */

import React from "react";
import type { DisputeStatus } from "@/lib/api/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DisputeTimelineEvent {
  id: string;
  status: DisputeStatus;
  label: string;
  /** ISO-8601 datetime string */
  timestamp: string;
  /** Optional free-text note (e.g. "Initiator: GBK…AF2") */
  note?: string;
}

export interface DisputeTimelineProps {
  events: DisputeTimelineEvent[];
  /** Overall dispute status — drives the live-region announcement. */
  currentStatus: DisputeStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

const STATUS_COLOR: Record<DisputeStatus, string> = {
  OPEN: "bg-status-danger",
  UNDER_REVIEW: "bg-gold",
  RESOLVED: "bg-accent-emerald",
  CLOSED: "bg-text-muted",
};

const STATUS_LABEL: Record<DisputeStatus, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const LIVE_REGION_LABEL: Record<DisputeStatus, string | null> = {
  OPEN: "Dispute is currently open and awaiting review.",
  UNDER_REVIEW: "Dispute is currently under mediator review.",
  RESOLVED: null,
  CLOSED: null,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: DisputeStatus }) {
  const color = STATUS_COLOR[status] ?? "bg-text-muted";
  const isActive = status === "OPEN" || status === "UNDER_REVIEW";
  return (
    <span
      aria-hidden
      className={`inline-block w-3 h-3 rounded-full shrink-0 ${color} ${isActive ? "animate-pulse" : ""}`}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DisputeTimeline({
  events,
  currentStatus,
}: DisputeTimelineProps) {
  const liveAnnouncement = LIVE_REGION_LABEL[currentStatus];

  return (
    <div className="bg-card rounded-xl border border-border-default p-6 shadow-card">
      <h2 className="text-sm font-semibold text-text-secondary tracking-wide uppercase mb-4">
        Dispute Timeline
      </h2>

      {/* Live region — announces in-progress status to AT */}
      {liveAnnouncement && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {liveAnnouncement}
        </p>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-text-muted">No timeline events recorded.</p>
      ) : (
        <ol
          aria-label="Dispute timeline"
          className="space-y-0"
        >
          {events.map((event, index) => {
            const isLast = index === events.length - 1;
            const stepNumber = index + 1;
            const totalSteps = events.length;
            const formattedTime = formatTimestamp(event.timestamp);

            return (
              <li key={event.id} className="relative flex gap-3">
                {/* Connector line — purely decorative */}
                <div
                  aria-hidden
                  className="relative w-5 shrink-0 flex flex-col items-center"
                >
                  <span className="mt-1 z-10">
                    <StatusDot status={event.status} />
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden
                      className="flex-1 w-0.5 bg-border-default mt-1 min-h-[32px]"
                    />
                  )}
                </div>

                {/* Event content */}
                <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                  {/* Visually-hidden full announcement for AT */}
                  <span className="sr-only">
                    {`Step ${stepNumber} of ${totalSteps}: ${event.label}, ${STATUS_LABEL[event.status]}, ${formattedTime}.${event.note ? ` ${event.note}` : ""}`}
                  </span>

                  {/* Visible content — aria-hidden so AT reads the sr-only text instead */}
                  <div aria-hidden className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary leading-tight">
                      {event.label}
                    </span>
                    <time
                      dateTime={event.timestamp}
                      className="text-xs text-text-muted shrink-0 tabular-nums"
                    >
                      {formattedTime}
                    </time>
                  </div>

                  {/* Status badge */}
                  <div aria-hidden className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide
                        ${event.status === "RESOLVED" || event.status === "CLOSED"
                          ? "bg-accent-emerald/15 text-accent-emerald"
                          : event.status === "UNDER_REVIEW"
                            ? "bg-gold/15 text-gold"
                            : "bg-status-danger/15 text-status-danger"
                        }`}
                    >
                      {STATUS_LABEL[event.status]}
                    </span>
                  </div>

                  {event.note && (
                    <p
                      aria-hidden
                      className="mt-1 text-xs text-text-secondary leading-relaxed"
                    >
                      {event.note}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default DisputeTimeline;
