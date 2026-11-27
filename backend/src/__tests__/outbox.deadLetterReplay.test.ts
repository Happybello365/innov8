import {
  replayDeadLetter,
  validateReplayRequest,
  OUTBOX_REPLAY_AUDIT_ACTION,
  type ReplayPrisma,
} from "../lib/outbox/deadLetterReplay";

function makePrisma(row: any, updateCount = 1) {
  const updateMany = jest.fn().mockResolvedValue({ count: updateCount });
  const auditCreate = jest.fn().mockResolvedValue({});
  const prisma: ReplayPrisma = {
    chainEventOutbox: { findUnique: jest.fn().mockResolvedValue(row) },
    $transaction: (fn: any) => fn({ chainEventOutbox: { updateMany }, adminActionAudit: { create: auditCreate } }),
  };
  return { prisma, updateMany, auditCreate };
}

const deadRow = { id: 7, tradeId: "t-1", eventType: "TradeFunded", status: "DEAD_LETTER", attempts: 5 };

describe("validateReplayRequest", () => {
  it("rejects missing/invalid eventId and reason", () => {
    expect(validateReplayRequest({})).toMatch(/eventId/);
    expect(validateReplayRequest({ eventId: -1, reason: "abc" })).toMatch(/eventId/);
    expect(validateReplayRequest({ eventId: 1 })).toMatch(/reason/);
    expect(validateReplayRequest({ eventId: 1, reason: "x".repeat(501) })).toMatch(/reason/);
  });
  it("accepts a valid request", () => {
    expect(validateReplayRequest({ eventId: "3", reason: " fixed handler ", dryRun: true })).toEqual({
      eventId: 3,
      reason: "fixed handler",
      dryRun: true,
    });
  });
});

describe("replayDeadLetter", () => {
  it("returns NOT_FOUND for unknown events", async () => {
    const { prisma } = makePrisma(null);
    const r = await replayDeadLetter(prisma, { eventId: 1, reason: "abc", actor: "G1" });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it.each(["PROCESSED", "PENDING", "RETRYING"])("refuses to replay %s events", async (status) => {
    const { prisma, updateMany } = makePrisma({ ...deadRow, status });
    const r = await replayDeadLetter(prisma, { eventId: 7, reason: "abc", actor: "G1" });
    expect(r).toMatchObject({ ok: false, code: "NOT_REPLAYABLE" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("dry run does not mutate or audit", async () => {
    const { prisma, updateMany, auditCreate } = makePrisma(deadRow);
    const r = await replayDeadLetter(prisma, { eventId: 7, reason: "abc", actor: "G1", dryRun: true });
    expect(r).toMatchObject({ ok: true, dryRun: true });
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("resets the event and writes an audit row", async () => {
    const { prisma, updateMany, auditCreate } = makePrisma(deadRow);
    const r = await replayDeadLetter(prisma, { eventId: 7, reason: "handler fixed", actor: "GADMIN" });
    expect(r).toMatchObject({ ok: true, dryRun: false, eventId: 7, previousStatus: "DEAD_LETTER" });
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 7, status: { in: ["DEAD_LETTER", "FAILED"] } });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: "PENDING", attempts: 0 });
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: OUTBOX_REPLAY_AUDIT_ACTION, actorAddress: "GADMIN", targetReference: "outbox:7" });
    expect(JSON.parse(audit.note)).toMatchObject({ reason: "handler fixed", previousAttempts: 5 });
  });

  it("does not audit when a concurrent change wins the race", async () => {
    const { prisma, auditCreate } = makePrisma(deadRow, 0);
    const r = await replayDeadLetter(prisma, { eventId: 7, reason: "abc", actor: "G1" });
    expect(r).toMatchObject({ ok: false, code: "NOT_REPLAYABLE" });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
