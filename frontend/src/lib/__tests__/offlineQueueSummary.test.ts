import { summarizeQueuedActions, describeQueuedActionBreakdown } from "../offlineQueueSummary";
import type { QueuedAction, QueuedActionType } from "@/stores/offlineQueueStore";

function action(type: QueuedActionType, id = type): QueuedAction {
  return {
    id,
    type,
    endpoint: "/x",
    method: "POST",
    idempotencyKey: `k-${id}`,
    correlationId: `c-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    attempts: 0,
  };
}

describe("summarizeQueuedActions", () => {
  it("returns zero total and no breakdown for an empty queue", () => {
    expect(summarizeQueuedActions([])).toEqual({ total: 0, byType: [] });
    expect(describeQueuedActionBreakdown(summarizeQueuedActions([]))).toBe("");
  });

  it("counts actions per type with singular and plural labels", () => {
    const summary = summarizeQueuedActions([
      action("deposit", "a"),
      action("deposit", "b"),
      action("release", "c"),
    ]);

    expect(summary.total).toBe(3);
    expect(summary.byType).toEqual([
      { type: "deposit", label: "deposits", count: 2 },
      { type: "release", label: "release", count: 1 },
    ]);
  });

  it("orders types consistently regardless of queue order", () => {
    const summary = summarizeQueuedActions([action("manifest", "a"), action("create-trade", "b")]);
    expect(summary.byType.map((t) => t.type)).toEqual(["create-trade", "manifest"]);
  });

  it("builds a readable breakdown string", () => {
    const summary = summarizeQueuedActions([
      action("deposit", "a"),
      action("deposit", "b"),
      action("release", "c"),
    ]);
    expect(describeQueuedActionBreakdown(summary)).toBe("2 deposits, 1 release");
  });

  it("does not mutate the input queue", () => {
    const queue = [action("deposit", "a")];
    const snapshot = JSON.stringify(queue);
    summarizeQueuedActions(queue);
    expect(JSON.stringify(queue)).toBe(snapshot);
  });
});
