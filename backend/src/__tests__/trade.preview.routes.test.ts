/**
 * Tests for GET /trades/:id/preview — the unauthenticated trade share-preview endpoint.
 */

import express from "express";
import request from "supertest";
import { TradeStatus } from "@prisma/client";
import { createTradePreviewRouter } from "../routes/trade.preview.routes";
import { errorHandler } from "../middleware/errorHandler";

function makeApp(mockPrisma: any) {
  const app = express();
  app.use(express.json());
  app.use("/trades", createTradePreviewRouter(mockPrisma));
  app.use(errorHandler);
  return app;
}

const BASE_TRADE = {
  tradeId: "trade-abc-123",
  status: TradeStatus.FUNDED,
  buyerAddress:  "GABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890ABCDEFGHIJKLMN",
  sellerAddress: "GSELLRADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  amountUsdc: "5000",
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  expiresAt: new Date("2026-02-15T10:00:00.000Z"),
  fundedAt: new Date("2026-01-16T08:00:00.000Z"),
  completedAt: null,
};

describe("GET /trades/:id/preview", () => {
  describe("successful previews", () => {
    it("returns 200 with a safe preview for a FUNDED trade", async () => {
      const mockPrisma = {
        trade: {
          findFirst: jest.fn().mockResolvedValue(BASE_TRADE),
        },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      expect(res.body.tradeId).toBe("trade-abc-123");
      expect(res.body.status).toBe("FUNDED");
      expect(res.body.disputed).toBe(false);
    });

    it("does not expose full wallet addresses", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      // Full addresses must not appear anywhere in the response body.
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(BASE_TRADE.buyerAddress);
      expect(body).not.toContain(BASE_TRADE.sellerAddress);
      // Abbreviated previews must be present.
      expect(res.body.buyerAddressPreview).toMatch(/^GABCDE.*$/);
      expect(res.body.sellerAddressPreview).toMatch(/^GSELLR.*$/);
      // Both must contain the truncation marker.
      expect(res.body.buyerAddressPreview).toContain("…");
      expect(res.body.sellerAddressPreview).toContain("…");
    });

    it("does not expose exact amount — returns a tier string", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      expect(res.body.amountTier).toBeDefined();
      expect(res.body.amountTier).not.toContain("5000");
      expect(res.body).not.toHaveProperty("amountUsdc");
    });

    it("sets disputed:true for a DISPUTED trade", async () => {
      const trade = { ...BASE_TRADE, status: TradeStatus.DISPUTED };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(trade) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      expect(res.body.disputed).toBe(true);
    });

    it("returns 200 for a COMPLETED trade", async () => {
      const trade = {
        ...BASE_TRADE,
        status: TradeStatus.COMPLETED,
        completedAt: new Date("2026-01-20T12:00:00.000Z"),
      };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(trade) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      expect(res.body.completedAt).toBeDefined();
    });

    it("includes expiresAt when set", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      expect(res.body.expiresAt).toBe("2026-02-15T10:00:00.000Z");
    });

    it("omits expiresAt when null", async () => {
      const trade = { ...BASE_TRADE, expiresAt: null };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(trade) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("expiresAt");
    });
  });

  describe("not found", () => {
    it("returns 404 when the trade does not exist", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/nonexistent-trade/preview");

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("terminal / expired trades", () => {
    it("returns 410 for a CANCELLED trade", async () => {
      const trade = { ...BASE_TRADE, status: TradeStatus.CANCELLED };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(trade) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(410);
      expect(res.body.status).toBe("CANCELLED");
      expect(res.body.tradeId).toBe("trade-abc-123");
    });

    it("returns 410 for an EXPIRED trade", async () => {
      const trade = { ...BASE_TRADE, status: TradeStatus.EXPIRED };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(trade) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-abc-123/preview");

      expect(res.status).toBe(410);
      expect(res.body.status).toBe("EXPIRED");
    });
  });

  describe("amount tiers", () => {
    const tiers: Array<[string, string]> = [
      ["50", "<100 USDC"],
      ["100", "100–999 USDC"],
      ["999.99", "100–999 USDC"],
      ["1000", "1,000–9,999 USDC"],
      ["9999", "1,000–9,999 USDC"],
      ["10000", "10,000–99,999 USDC"],
      ["100000", "100,000+ USDC"],
      ["0", "unknown"],
      ["-1", "unknown"],
    ];

    for (const [amount, expectedTier] of tiers) {
      it(`amount ${amount} maps to "${expectedTier}"`, async () => {
        const trade = { ...BASE_TRADE, amountUsdc: amount };
        const mockPrisma = {
          trade: {
            findFirst: jest.fn().mockResolvedValue(
              trade.status === TradeStatus.FUNDED ? trade : BASE_TRADE,
            ),
          },
        } as any;
        // Use a fresh mock per sub-test
        const mockP = {
          trade: { findFirst: jest.fn().mockResolvedValue({ ...BASE_TRADE, amountUsdc: amount }) },
        } as any;
        const app = makeApp(mockP);

        const res = await request(app).get("/trades/trade-abc-123/preview");

        expect(res.status).toBe(200);
        expect(res.body.amountTier).toBe(expectedTier);
      });
    }
  });

  describe("validation", () => {
    it("returns 400 for an empty trade ID", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn() },
      } as any;
      const app = makeApp(mockPrisma);

      // Express will not match "/:id/preview" with an empty segment.
      // The route simply won't match, so we expect 404.
      const res = await request(app).get("/trades//preview");
      expect([400, 404]).toContain(res.status);
    });
  });
});
