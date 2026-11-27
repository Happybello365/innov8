/**
 * Tests for issue #452 — error response localization support.
 */
import express from "express";
import request from "supertest";
import { parseSupportedLocale, getLocalizedMessage, getSupportedLocales } from "../lib/errorLocalization";
import { errorHandler } from "../middleware/errorHandler";
import { AppError, ErrorCode } from "../errors/errorCodes";

describe("#452 error localization", () => {
  describe("parseSupportedLocale", () => {
    it("returns null when header is absent", () => {
      expect(parseSupportedLocale(undefined)).toBeNull();
    });

    it("returns null for an unsupported locale", () => {
      expect(parseSupportedLocale("de-DE,de;q=0.9")).toBeNull();
    });

    it("returns 'fr' for a French header", () => {
      expect(parseSupportedLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    });

    it("returns 'yo' for a Yoruba header", () => {
      expect(parseSupportedLocale("yo,en;q=0.5")).toBe("yo");
    });

    it("returns 'ha' for a Hausa header", () => {
      expect(parseSupportedLocale("ha")).toBe("ha");
    });

    it("is case-insensitive", () => {
      expect(parseSupportedLocale("FR")).toBe("fr");
    });
  });

  describe("getLocalizedMessage", () => {
    it("returns a French message for TRADE_NOT_FOUND", () => {
      const msg = getLocalizedMessage(ErrorCode.TRADE_NOT_FOUND, "fr");
      expect(msg).toBeTruthy();
      expect(typeof msg).toBe("string");
    });

    it("returns null for an unsupported locale", () => {
      expect(getLocalizedMessage(ErrorCode.TRADE_NOT_FOUND, "de")).toBeNull();
    });

    it("returns null for a code with no translation in that locale", () => {
      // TRADE_BUILD_FAILED has no Yoruba translation
      expect(getLocalizedMessage(ErrorCode.TRADE_BUILD_FAILED, "yo")).toBeNull();
    });
  });

  describe("getSupportedLocales", () => {
    it("returns an array including fr, yo, ha", () => {
      const locales = getSupportedLocales();
      expect(locales).toContain("fr");
      expect(locales).toContain("yo");
      expect(locales).toContain("ha");
    });
  });

  describe("error handler integration", () => {
    function buildApp(err: unknown) {
      const app = express();
      app.get("/test", (_req, _res, next) => next(err));
      app.use(errorHandler);
      return app;
    }

    it("includes localizedMessage when Accept-Language matches a supported locale", async () => {
      const app = buildApp(new AppError(ErrorCode.TRADE_NOT_FOUND, "Trade not found", 404));
      const res = await request(app)
        .get("/test")
        .set("Accept-Language", "fr-FR,fr;q=0.9");
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(ErrorCode.TRADE_NOT_FOUND);
      expect(typeof res.body.localizedMessage).toBe("string");
      expect(res.body.localizedMessage).not.toBe(res.body.message);
    });

    it("omits localizedMessage when no Accept-Language header is sent", async () => {
      const app = buildApp(new AppError(ErrorCode.TRADE_NOT_FOUND, "Trade not found", 404));
      const res = await request(app).get("/test");
      expect(res.status).toBe(404);
      expect(res.body.localizedMessage).toBeUndefined();
    });

    it("omits localizedMessage when locale is unsupported", async () => {
      const app = buildApp(new AppError(ErrorCode.TRADE_NOT_FOUND, "Trade not found", 404));
      const res = await request(app)
        .get("/test")
        .set("Accept-Language", "de-DE");
      expect(res.status).toBe(404);
      expect(res.body.localizedMessage).toBeUndefined();
    });

    it("includes localizedMessage for ZodError with fr locale", async () => {
      const { z } = await import("zod");
      const app = buildApp(z.object({ x: z.number() }).parse({ x: "bad" } as any));
      const res = await request(app)
        .get("/test")
        .set("Accept-Language", "fr");
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(typeof res.body.localizedMessage).toBe("string");
    });

    it("falls back gracefully when code has no translation in the locale", async () => {
      const app = buildApp(new AppError(ErrorCode.TRADE_BUILD_FAILED, "build failed", 500));
      const res = await request(app)
        .get("/test")
        .set("Accept-Language", "yo");
      expect(res.status).toBe(500);
      // No translation for TRADE_BUILD_FAILED in Yoruba → no localizedMessage
      expect(res.body.localizedMessage).toBeUndefined();
    });
  });

  describe("GET /meta/locales endpoint", () => {
    it("returns the list of supported locales", async () => {
      const { createMetaRouter } = await import("../routes/meta.routes");
      const app = express();
      app.use("/meta", createMetaRouter());
      const res = await request(app).get("/meta/locales");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.locales)).toBe(true);
      expect(res.body.locales).toContain("fr");
    });
  });
});
