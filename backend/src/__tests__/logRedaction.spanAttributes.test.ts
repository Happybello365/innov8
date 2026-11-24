/**
 * Tests for sanitizeSpanAttributes — the OTel span attribute sanitiser that
 * ensures crash breadcrumbs never carry secrets or PII.
 */

import { sanitizeSpanAttributes } from "../lib/logRedaction";

describe("sanitizeSpanAttributes", () => {
  describe("PII field denylist", () => {
    it("drops email field entirely", () => {
      const result = sanitizeSpanAttributes({ email: "user@example.com" });
      expect(result).not.toHaveProperty("email");
    });

    it("drops phone / phoneNumber fields", () => {
      const result = sanitizeSpanAttributes({
        phone: "+2348012345678",
        phoneNumber: "555-123-4567",
      });
      expect(result).not.toHaveProperty("phone");
      expect(result).not.toHaveProperty("phoneNumber");
    });

    it("drops driverIdNumber field", () => {
      const result = sanitizeSpanAttributes({ driverIdNumber: "DL-99881" });
      expect(result).not.toHaveProperty("driverIdNumber");
    });

    it("drops driverName field", () => {
      const result = sanitizeSpanAttributes({ driverName: "John Smith" });
      expect(result).not.toHaveProperty("driverName");
    });

    it("drops buyerName and sellerName fields", () => {
      const result = sanitizeSpanAttributes({
        buyerName: "Alice",
        sellerName: "Bob",
      });
      expect(result).not.toHaveProperty("buyerName");
      expect(result).not.toHaveProperty("sellerName");
    });
  });

  describe("secret key denylist", () => {
    it("drops authorization header value", () => {
      const result = sanitizeSpanAttributes({
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.xxx",
      });
      expect(result).not.toHaveProperty("authorization");
    });

    it("drops cookie value", () => {
      const result = sanitizeSpanAttributes({ cookie: "session=abc123" });
      expect(result).not.toHaveProperty("cookie");
    });

    it("drops token, apiKey, privateKey", () => {
      const result = sanitizeSpanAttributes({
        token: "tok_live_abc",
        apiKey: "sk-1234",
        privateKey: "-----BEGIN PRIVATE KEY-----",
      });
      expect(result).not.toHaveProperty("token");
      expect(result).not.toHaveProperty("apiKey");
      expect(result).not.toHaveProperty("privateKey");
    });

    it("drops accessToken and refreshToken", () => {
      const result = sanitizeSpanAttributes({
        accessToken: "at_live_xxx",
        refreshToken: "rt_live_yyy",
      });
      expect(result).not.toHaveProperty("accessToken");
      expect(result).not.toHaveProperty("refreshToken");
    });

    it("drops password and otp", () => {
      const result = sanitizeSpanAttributes({ password: "hunter2", otp: "123456" });
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("otp");
    });
  });

  describe("pattern scrubbing in string values", () => {
    it("scrubs email-shaped substrings from allowed string fields", () => {
      const result = sanitizeSpanAttributes({
        "http.user_agent": "Contact support at ops@example.com for help",
      });
      expect(result["http.user_agent"]).not.toContain("ops@example.com");
      expect(result["http.user_agent"]).toContain("[REDACTED_EMAIL]");
    });

    it("scrubs phone-shaped substrings from string values", () => {
      const result = sanitizeSpanAttributes({
        message: "Call +2348012345678 for delivery status",
      });
      expect(result["message"]).not.toContain("+2348012345678");
      expect(result["message"]).toContain("[REDACTED_PHONE]");
    });
  });

  describe("passthrough for safe fields", () => {
    it("preserves HTTP method, status code, and URL", () => {
      const result = sanitizeSpanAttributes({
        "http.method": "GET",
        "http.status_code": 200,
        "http.url": "/trades/abc-123",
      });
      expect(result["http.method"]).toBe("GET");
      expect(result["http.status_code"]).toBe(200);
      expect(result["http.url"]).toBe("/trades/abc-123");
    });

    it("preserves boolean and numeric values unchanged", () => {
      const result = sanitizeSpanAttributes({
        "sampling.priority": 1,
        "error": false,
        "http.response_body_size": 4096,
      });
      expect(result["sampling.priority"]).toBe(1);
      expect(result["error"]).toBe(false);
      expect(result["http.response_body_size"]).toBe(4096);
    });

    it("preserves correlation and request ID fields", () => {
      const correlationId = "550e8400-e29b-41d4-a716-446655440000";
      const result = sanitizeSpanAttributes({
        "correlation.id": correlationId,
        "request.id": "req-123",
      });
      expect(result["correlation.id"]).toBe(correlationId);
      expect(result["request.id"]).toBe("req-123");
    });
  });

  describe("non-scalar value handling", () => {
    it("JSON-serialises nested objects and scrubs patterns in them", () => {
      const result = sanitizeSpanAttributes({
        metadata: { event: "trade.created", contact: "buyer@example.com" },
      });
      expect(typeof result["metadata"]).toBe("string");
      expect(result["metadata"] as string).not.toContain("buyer@example.com");
      expect(result["metadata"] as string).toContain("[REDACTED_EMAIL]");
    });

    it("JSON-serialises arrays", () => {
      const result = sanitizeSpanAttributes({
        tags: ["trade", "funded"],
      });
      expect(typeof result["tags"]).toBe("string");
      expect(result["tags"]).toContain("trade");
    });

    it("omits null and undefined values", () => {
      const result = sanitizeSpanAttributes({
        nullField: null,
        undefField: undefined,
        kept: "value",
      });
      expect(result).not.toHaveProperty("nullField");
      expect(result).not.toHaveProperty("undefField");
      expect(result["kept"]).toBe("value");
    });

    it("handles unserializable objects gracefully", () => {
      const circular: Record<string, unknown> = {};
      circular["self"] = circular;
      const result = sanitizeSpanAttributes({ circular });
      expect(result["circular"]).toBe("[UNSERIALIZABLE]");
    });
  });

  describe("key normalisation", () => {
    it("matches denylist regardless of camelCase / PascalCase", () => {
      const result = sanitizeSpanAttributes({
        Authorization: "Bearer tok",
        COOKIE: "session=x",
        "X-Api-Key": "key123",
      });
      expect(result).not.toHaveProperty("Authorization");
      expect(result).not.toHaveProperty("COOKIE");
      expect(result).not.toHaveProperty("X-Api-Key");
    });
  });
});
