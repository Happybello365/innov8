/**
 * Tests for issue #451 — central redaction policy for secrets and additional
 * sensitive fields beyond the original PII denylist.
 */
import { redactPii, redactSecret, PII_FIELD_DENYLIST } from "../lib/logRedaction";

describe("#451 central secret redaction policy", () => {
  describe("extended denylist — secret fields", () => {
    it.each([
      ["jwtSecret", "super-secret-jwt"],
      ["adminSecretKey", "SADMIN123"],
      ["databaseUrl", "postgresql://user:pass@host/db"],
      ["redisUrl", "redis://:password@redis:6379"],
      ["supabaseServiceRoleKey", "eyJhbGci..."],
      ["pinataJwt", "eyJhbGci..."],
      ["pinataSecret", "abc123"],
      ["ipfsUrlSigningSecret", "signingsecret"],
      ["webhookSecret", "wh_secret"],
      ["alertWebhookSecret", "alert_secret"],
      ["inboundWebhookSecrets", '{"stellar":"s3cr3t"}'],
      ["secret", "any-secret-value"],
      ["clientSecret", "oauth-client-secret"],
      ["auditsigningprivatekey", "-----BEGIN PRIVATE KEY-----"],
      ["privatekeypem", "-----BEGIN PRIVATE KEY-----"],
    ])('redacts field "%s"', (field, value) => {
      const result = redactPii({ [field]: value });
      expect((result as Record<string, unknown>)[field]).toBe("[REDACTED]");
    });
  });

  describe("URL credential scrubbing", () => {
    it("strips user:password@ from connection strings embedded in free-text", () => {
      const result = redactPii({
        message: "DB connection failed: postgresql://admin:hunter2@db.example.com/prod",
      });
      expect((result as { message: string }).message).not.toContain("hunter2");
      expect((result as { message: string }).message).toContain("[REDACTED]@db.example.com");
    });

    it("strips redis credential from free-text", () => {
      const result = redactPii({
        message: "Cache unavailable at redis://:supersecret@cache.host:6379",
      });
      expect((result as { message: string }).message).not.toContain("supersecret");
      expect((result as { message: string }).message).toContain("[REDACTED]@cache.host");
    });

    it("does not corrupt URLs without credentials", () => {
      const result = redactPii({
        url: "https://api.example.com/v1/trades?page=1",
      });
      expect((result as { url: string }).url).toBe("https://api.example.com/v1/trades?page=1");
    });
  });

  describe("redactSecret helper", () => {
    it("returns [REDACTED] for a non-empty string", () => {
      expect(redactSecret("super-secret")).toBe("[REDACTED]");
    });

    it("returns empty string for null", () => {
      expect(redactSecret(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(redactSecret(undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(redactSecret("")).toBe("");
    });
  });

  describe("denylist completeness", () => {
    it("covers all secret keys defined in env.ts SECRET_ENV_KEYS", () => {
      // These are the env-level secret keys. The denylist normalizes
      // (lowercase, strip non-alpha) so we do the same before checking.
      const secretEnvKeys = [
        "JWT_SECRET",
        "ADMIN_SECRET_KEY",
        "IPFS_URL_SIGNING_SECRET",
        "WEBHOOK_SECRET",
        "ALERT_WEBHOOK_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY",
        "AUDIT_SIGNING_PRIVATE_KEY_PEM",
        "PINATA_SECRET",
        "PINATA_JWT",
        "PINATA_API_KEY",
      ];
      const normalize = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "");
      for (const key of secretEnvKeys) {
        const result = redactPii({ [key]: "some-value" });
        expect((result as Record<string, unknown>)[key]).toBe("[REDACTED]");
      }
    });
  });

  describe("existing PII tests still pass with extended denylist", () => {
    it("redacts email field", () => {
      expect((redactPii({ email: "a@b.com" }) as { email: unknown }).email).toBe("[REDACTED]");
    });

    it("does not redact safe fields like tradeId or amount", () => {
      const input = { tradeId: "T-99", amount: 500 };
      expect(redactPii(input)).toEqual(input);
    });
  });
});
