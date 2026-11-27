/**
 * Dead-letter replay with safeguards and audit history (issue #463).
 *
 * Safeguards:
 *  - only DEAD_LETTER (or FAILED) events may be replayed — never PROCESSED,
 *    PENDING or RETRYING ones, preventing double side effects;
 *  - an operator-supplied reason (3..500 chars) is mandatory;
 *  - `dryRun` reports what would happen without mutating anything;
 *  - every real replay writes an `AdminActionAudit` row (action
 *    `OUTBOX_DEAD_LETTER_REPLAY`) in the same transaction as the reset.
 */

export const REPLAYABLE_STATUSES = ["DEAD_LETTER", "FAILED"] as const;
export const OUTBOX_REPLAY_AUDIT_ACTION = "OUTBOX_DEAD_LETTER_REPLAY";

export interface ReplayRequest {
  eventId: number;
  reason: string;
  actor: string;
  dryRun?: boolean;
}

export type ReplayResult =
  | { ok: true; dryRun: boolean; eventId: number; tradeId: string; previousStatus: string }
  | { ok: false; code: "VALIDATION" | "NOT_FOUND" | "NOT_REPLAYABLE"; message: string };

interface OutboxRow {
  id: number;
  tradeId: string;
  eventType: string;
  status: string;
  attempts: number;
}

/** Minimal Prisma surface used, so the helper is unit-testable with fakes. */
export interface ReplayPrisma {
  chainEventOutbox: {
    findUnique(args: { where: { id: number } }): Promise<OutboxRow | null>;
  };
  $transaction<T>(fn: (tx: ReplayTx) => Promise<T>): Promise<T>;
}

export interface ReplayTx {
  chainEventOutbox: {
    updateMany(args: {
      where: { id: number; status: { in: string[] } };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  adminActionAudit: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export function validateReplayRequest(body: unknown): { eventId: number; reason: string; dryRun: boolean } | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const eventId = Number(b.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) return "eventId must be a positive integer";
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) return "reason is required (3-500 characters)";
  return { eventId, reason, dryRun: b.dryRun === true || b.dryRun === "true" };
}

export async function replayDeadLetter(prisma: ReplayPrisma, req: ReplayRequest): Promise<ReplayResult> {
  const event = await prisma.chainEventOutbox.findUnique({ where: { id: req.eventId } });
  if (!event) return { ok: false, code: "NOT_FOUND", message: "Event not found" };

  if (!(REPLAYABLE_STATUSES as readonly string[]).includes(event.status)) {
    return {
      ok: false,
      code: "NOT_REPLAYABLE",
      message: `Only ${REPLAYABLE_STATUSES.join("/")} events can be replayed (current: ${event.status})`,
    };
  }

  if (req.dryRun) {
    return { ok: true, dryRun: true, eventId: event.id, tradeId: event.tradeId, previousStatus: event.status };
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional update guards against a concurrent replay/processing race.
    const res = await tx.chainEventOutbox.updateMany({
      where: { id: event.id, status: { in: [...REPLAYABLE_STATUSES] } },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
        deadLetteredAt: null,
      },
    });
    if (res.count === 0) return false;
    await tx.adminActionAudit.create({
      data: {
        action: OUTBOX_REPLAY_AUDIT_ACTION,
        actorAddress: req.actor,
        targetReference: `outbox:${event.id}`,
        note: JSON.stringify({
          reason: req.reason,
          tradeId: event.tradeId,
          eventType: event.eventType,
          previousStatus: event.status,
          previousAttempts: event.attempts,
        }),
      },
    });
    return true;
  });

  if (!updated) {
    return { ok: false, code: "NOT_REPLAYABLE", message: "Event status changed concurrently; not replayed" };
  }
  return { ok: true, dryRun: false, eventId: event.id, tradeId: event.tradeId, previousStatus: event.status };
}
