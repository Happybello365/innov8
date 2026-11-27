import { DuplicateDeliveryCounter } from "../lib/outbox/duplicateDeliveryCounter";

describe("DuplicateDeliveryCounter", () => {
  it("starts empty", () => {
    expect(new DuplicateDeliveryCounter().snapshot()).toEqual({
      total: 0,
      bySource: { processed_event_conflict: 0, outbox_already_processed: 0 },
      byEventType: {},
      lastDetectedAt: null,
    });
  });

  it("counts by source and event type", () => {
    const c = new DuplicateDeliveryCounter();
    const t = new Date("2026-01-01T00:00:00Z");
    c.record("processed_event_conflict", "TradeFunded");
    c.record("processed_event_conflict", "TradeFunded");
    c.record("outbox_already_processed", "", t);
    const s = c.snapshot();
    expect(s.total).toBe(3);
    expect(s.bySource).toEqual({ processed_event_conflict: 2, outbox_already_processed: 1 });
    expect(s.byEventType).toEqual({ TradeFunded: 2, unknown: 1 });
    expect(s.lastDetectedAt).toBe(t.toISOString());
  });

  it("reset clears counts", () => {
    const c = new DuplicateDeliveryCounter();
    c.record("processed_event_conflict", "X");
    c.reset();
    expect(c.snapshot().total).toBe(0);
  });
});
