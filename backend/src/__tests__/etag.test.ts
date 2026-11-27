/**
 * Tests for issue #453 — ETag / If-None-Match conditional request support.
 */
import { Request } from "express";
import { computeETag, checkConditionalRequest } from "../lib/etag";

describe("#453 ETag helpers", () => {
  describe("computeETag", () => {
    it("returns a weak ETag string (starts with W/\")", () => {
      const tag = computeETag("T-1", 3, new Date("2025-01-01T00:00:00Z"));
      expect(tag).toMatch(/^W\/"[0-9a-f]{16}"$/);
    });

    it("produces the same tag for identical inputs", () => {
      const d = new Date("2025-01-01T00:00:00Z");
      expect(computeETag("T-1", 3, d)).toBe(computeETag("T-1", 3, d));
    });

    it("produces different tags when version changes", () => {
      const d = new Date("2025-01-01T00:00:00Z");
      expect(computeETag("T-1", 3, d)).not.toBe(computeETag("T-1", 4, d));
    });

    it("produces different tags when updatedAt changes", () => {
      const d1 = new Date("2025-01-01T00:00:00Z");
      const d2 = new Date("2025-01-02T00:00:00Z");
      expect(computeETag("T-1", 3, d1)).not.toBe(computeETag("T-1", 3, d2));
    });

    it("produces different tags for different resource IDs", () => {
      const d = new Date("2025-01-01T00:00:00Z");
      expect(computeETag("T-1", 1, d)).not.toBe(computeETag("T-2", 1, d));
    });

    it("accepts string-formatted date", () => {
      const tag1 = computeETag("T-1", 1, new Date("2025-06-01T12:00:00Z"));
      const tag2 = computeETag("T-1", 1, "2025-06-01T12:00:00.000Z");
      expect(tag1).toBe(tag2);
    });

    it("treats undefined version as 0", () => {
      const d = new Date("2025-01-01T00:00:00Z");
      expect(computeETag("T-1", undefined, d)).toBe(computeETag("T-1", 0, d));
    });
  });

  describe("checkConditionalRequest", () => {
    function mockReq(ifNoneMatch?: string): Request {
      return { headers: { "if-none-match": ifNoneMatch } } as unknown as Request;
    }

    it("returns false when no If-None-Match header is present", () => {
      const tag = computeETag("T-1", 1, new Date());
      expect(checkConditionalRequest(mockReq(), tag)).toBe(false);
    });

    it("returns true when If-None-Match matches the current ETag", () => {
      const tag = computeETag("T-1", 1, new Date("2025-01-01T00:00:00Z"));
      expect(checkConditionalRequest(mockReq(tag), tag)).toBe(true);
    });

    it("returns false when If-None-Match does not match", () => {
      const current = computeETag("T-1", 2, new Date("2025-01-02T00:00:00Z"));
      const stale = computeETag("T-1", 1, new Date("2025-01-01T00:00:00Z"));
      expect(checkConditionalRequest(mockReq(stale), current)).toBe(false);
    });

    it("matches when If-None-Match is a comma-separated list containing the ETag", () => {
      const tag = computeETag("T-1", 1, new Date("2025-01-01T00:00:00Z"));
      const stale = computeETag("T-1", 0, new Date("2024-12-31T00:00:00Z"));
      expect(checkConditionalRequest(mockReq(`${stale}, ${tag}`), tag)).toBe(true);
    });

    it("returns false for wildcard * (not a match for cache reads)", () => {
      const tag = computeETag("T-1", 1, new Date());
      expect(checkConditionalRequest(mockReq("*"), tag)).toBe(false);
    });
  });

  describe("trade route ETag integration", () => {
    it("GET /trades/:id sets ETag header on 200 response", async () => {
      const express = (await import("express")).default;
      const request = (await import("supertest")).default;
      const { computeETag: ce, checkConditionalRequest: ccr } = await import("../lib/etag");

      const app = express();
      const mockTrade = {
        tradeId: "T-999",
        version: 5,
        updatedAt: new Date("2025-06-01T00:00:00Z"),
        status: "FUNDED",
      };
      app.get("/trades/:id", (req, res) => {
        const etag = ce(mockTrade.tradeId, mockTrade.version, mockTrade.updatedAt);
        res.set("ETag", etag);
        if (ccr(req, etag)) {
          return res.status(304).end();
        }
        return res.status(200).json(mockTrade);
      });

      const res = await request(app).get("/trades/T-999");
      expect(res.status).toBe(200);
      expect(res.headers["etag"]).toMatch(/^W\//);
    });

    it("GET /trades/:id returns 304 when If-None-Match matches", async () => {
      const express = (await import("express")).default;
      const request = (await import("supertest")).default;
      const { computeETag: ce, checkConditionalRequest: ccr } = await import("../lib/etag");

      const updatedAt = new Date("2025-06-01T00:00:00Z");
      const etag = ce("T-999", 5, updatedAt);

      const app = express();
      app.get("/trades/:id", (req, res) => {
        res.set("ETag", etag);
        if (ccr(req, etag)) {
          return res.status(304).end();
        }
        return res.status(200).json({ tradeId: "T-999" });
      });

      const res = await request(app)
        .get("/trades/T-999")
        .set("If-None-Match", etag);
      expect(res.status).toBe(304);
    });
  });
});
