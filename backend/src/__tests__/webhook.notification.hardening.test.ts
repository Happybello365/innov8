import crypto from "crypto";
import { canonicalize } from "../lib/canonicalJson";
import { summarizeWebhookHealth, FAILING_THRESHOLD } from "../services/webhookHealth.service";
import { evaluateDeliveryPreferences, resolveLocale } from "../services/notificationDeliveryPolicy.service";
import { NOTIFICATION_TEMPLATES, renderNotificationTemplate } from "../lib/notificationTemplates";

describe("canonicalize (#472)", () => {
  it("produces identical output regardless of key order", () => {
    const a = canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } });
    const b = canonicalize({ a: { c: "x", d: [3, { y: 2, z: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("yields identical HMAC signatures for reordered payloads", () => {
    const sig = (v: unknown) => crypto.createHmac("sha256", "s").update(canonicalize(v)).digest("hex");
    expect(sig({ x: 1, y: 2 })).toBe(sig({ y: 2, x: 1 }));
  });

  it("drops undefined, serializes dates and rejects non-finite numbers and cycles", () => {
    expect(canonicalize({ a: undefined, d: new Date(0) })).toBe('{"d":"1970-01-01T00:00:00.000Z"}');
    expect(() => canonicalize({ n: NaN })).toThrow(TypeError);
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => canonicalize(cyc)).toThrow(TypeError);
  });
});

describe("summarizeWebhookHealth (#471)", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  const webhook = { id: 1, url: "https://example.com/hook", isActive: true, createdAt: new Date("2026-01-01T00:00:00Z") };
  const at = (mins: number, status: string, statusCode: number) => ({
    timestamp: new Date(now.getTime() - mins * 60_000),
    status,
    statusCode,
  });

  it("reports idle when there are no attempts", () => {
    const s = summarizeWebhookHealth(webhook, [], now);
    expect(s).toMatchObject({ retryState: "idle", totalAttempts: 0, successRate: null, ageSeconds: 86400 });
  });

  it("computes counts, last timestamps and retrying state", () => {
    const s = summarizeWebhookHealth(webhook, [at(10, "success", 200), at(5, "failure", 500), at(1, "failure", 503)], now);
    expect(s).toMatchObject({
      totalAttempts: 3,
      successCount: 1,
      failureCount: 2,
      consecutiveFailures: 2,
      retryState: "retrying",
      secondsSinceLastSuccess: 600,
    });
    expect(s.lastAttemptAt).toBe(at(1, "", 0).timestamp.toISOString());
  });

  it("marks failing after the threshold and healthy after a success", () => {
    const fails = Array.from({ length: FAILING_THRESHOLD }, (_, i) => at(i + 1, "failure", 500));
    expect(summarizeWebhookHealth(webhook, fails, now).retryState).toBe("failing");
    expect(summarizeWebhookHealth(webhook, [...fails, at(0, "success", 200)], now).retryState).toBe("healthy");
  });
});

describe("evaluateDeliveryPreferences (#474)", () => {
  const quietHours = { quietHoursStart: "22:00", quietHoursEnd: "06:00", timezone: "UTC" };
  const night = new Date("2026-01-01T23:00:00Z");
  const day = new Date("2026-01-01T12:00:00Z");

  it("sends by default with resolved locale", () => {
    expect(evaluateDeliveryPreferences({ type: "trade_update", channel: "email", locale: "fr-CA", now: day })).toEqual({
      action: "send",
      channel: "email",
      locale: "fr",
    });
  });

  it("drops invalid channels, opted-out users and disabled channels", () => {
    expect(evaluateDeliveryPreferences({ type: "x", channel: "sms" })).toEqual({ action: "drop", reason: "invalid_channel" });
    expect(evaluateDeliveryPreferences({ type: "x", channel: "email", preferences: { optOut: true } })).toEqual({
      action: "drop",
      reason: "opted_out",
    });
    expect(
      evaluateDeliveryPreferences({ type: "x", channel: "email", preferences: { channels: { x: ["push"] } } }),
    ).toEqual({ action: "drop", reason: "channel_disabled" });
  });

  it("defers during quiet hours but lets critical notifications through", () => {
    expect(evaluateDeliveryPreferences({ type: "x", channel: "push", preferences: { quietHours }, now: night }).action).toBe("defer");
    expect(evaluateDeliveryPreferences({ type: "x", channel: "push", preferences: { quietHours }, now: day }).action).toBe("send");
    expect(
      evaluateDeliveryPreferences({ type: "dispute_opened", channel: "push", preferences: { quietHours }, now: night }).action,
    ).toBe("send");
    expect(
      evaluateDeliveryPreferences({ type: "dispute_opened", channel: "in-app", preferences: { optOut: true } }).action,
    ).toBe("send");
  });

  it("fails open on an invalid stored timezone", () => {
    const bad = { ...quietHours, timezone: "Not/AZone" };
    expect(evaluateDeliveryPreferences({ type: "x", channel: "push", preferences: { quietHours: bad }, now: night }).action).toBe("send");
  });

  it("falls back to the default locale", () => {
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("zz")).toBe("en");
  });
});

describe("renderNotificationTemplate (#473)", () => {
  it("fills variables and escapes HTML", () => {
    const r = renderNotificationTemplate(NOTIFICATION_TEMPLATES.trade_funded, { tradeId: "<b>1</b>", amount: 50 });
    expect(r.title).toBe("Trade &lt;b&gt;1&lt;/b&gt; funded");
    expect(r.message).toContain("50");
    expect(r.missingVariables).toEqual([]);
  });

  it("reports missing variables", () => {
    expect(renderNotificationTemplate(NOTIFICATION_TEMPLATES.funds_released, { tradeId: "1" }).missingVariables).toEqual(["amount"]);
  });
});
