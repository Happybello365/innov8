/**
 * Tests for GET /trades/:id/diagnostic — the authenticated redacted diagnostic bundle endpoint.
 */

import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { TradeStatus, DisputeStatus } from "@prisma/client";
import { createTradeDiagnosticRouter, amountTier } from "../routes/trade.diagnostic.routes";
import { AuthService } from "../services/auth.service";
import { errorHandler } from "../middleware/errorHandler";

jest.mock("../services/auth.service", () => ({
  AuthService: {
    validateToken: jest.fn(async (token: string) => {
      const jwt = require("jsonwebtoken");
      return jwt.decode(token);
    }),
    isTokenRevoked: jest.fn().mockResolvedValue(false),
  },
}));

const buyerAddress = StellarSdk.Keypair.random().publicKey();
const sellerAddress = StellarSdk.Keypair.random().publicKey();
const thirdPartyAddress = StellarSdk.Keypair.random().publicKey();

function mintToken(walletAddress: string, jti: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      walletAddress,
      jti,
      iss: process.env.JWT_ISSUER,
      aud: process.env.JWT_AUDIENCE,
      nbf: now - 1,
    },
    process.env.JWT_SECRET!,
    { algorithm: "HS256" },
  );
}

function makeApp(mockPrisma: any) {
  const app = express();
  app.use(express.json());
  app.use("/trades", createTradeDiagnosticRouter(mockPrisma));
  app.use(errorHandler);
  return app;
}

const BASE_TRADE = {
  id: 1,
  tradeId: "trade-diag-001",
  status: TradeStatus.FUNDED,
  buyerAddress,
  sellerAddress,
  amountUsdc: "5000",
  buyerLossBps: 5000,
  sellerLossBps: 5000,
  version: 3,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  updatedAt: new Date("2026-01-20T12:00:00.000Z"),
  fundedAt: new Date("2026-01-16T08:00:00.000Z"),
  deliveredAt: null,
  completedAt: null,
  expiresAt: new Date("2026-02-15T10:00:00.000Z"),
  expiredAt: null,
  dispute: null,
  evidence: [],
  notes: [],
  manifest: null,
  releaseMilestones: [],
};

describe("GET /trades/:id/diagnostic", () => {
  let buyerToken: string;
  let sellerToken: string;
  let thirdPartyToken: string;

  beforeAll(() => {
    buyerToken = mintToken(buyerAddress, "diag-buyer-jti");
    sellerToken = mintToken(sellerAddress, "diag-seller-jti");
    thirdPartyToken = mintToken(thirdPartyAddress, "diag-third-jti");
  });

  beforeEach(() => {
    jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
  });

  describe("authorization", () => {
    it("returns 401 without a token", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app).get("/trades/trade-diag-001/diagnostic");
      expect(res.status).toBe(401);
    });

    it("returns 403 for a third party (not buyer or seller)", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${thirdPartyToken}`);
      expect(res.status).toBe(403);
    });

    it("allows the buyer to fetch the bundle", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);
      expect(res.status).toBe(200);
    });

    it("allows the seller to fetch the bundle", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${sellerToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe("not found", () => {
    it("returns 404 when trade does not exist", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/nonexistent/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("bundle contents — PII exclusion", () => {
    it("does not include full wallet addresses", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(buyerAddress);
      expect(body).not.toContain(sellerAddress);
    });

    it("includes abbreviated requestedBy address", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.requestedBy).toBeDefined();
      // Should be abbreviated (not the full 56-char Stellar address)
      expect(res.body.requestedBy.length).toBeLessThan(buyerAddress.length);
      expect(res.body.requestedBy).toContain("…");
    });

    it("does not expose exact trade amount", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.trade).not.toHaveProperty("amountUsdc");
      expect(res.body.trade.amountTier).toBeDefined();
      expect(res.body.trade.amountTier).not.toContain("5000");
    });

    it("does not include dispute reason or initiator address", async () => {
      const tradeWithDispute = {
        ...BASE_TRADE,
        status: TradeStatus.DISPUTED,
        dispute: {
          status: DisputeStatus.OPEN,
          createdAt: new Date("2026-01-18T09:00:00.000Z"),
          resolvedAt: null,
          category: { name: "Quality Issue" },
        },
      };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(tradeWithDispute) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      // Dispute section must exist but must NOT contain the reason or initiator.
      expect(res.body.dispute).toBeDefined();
      expect(res.body.dispute).not.toHaveProperty("reason");
      expect(res.body.dispute).not.toHaveProperty("initiator");
      expect(res.body.dispute.status).toBe("OPEN");
      expect(res.body.dispute.categoryName).toBe("Quality Issue");
    });

    it("does not include manifest driver name or ID number", async () => {
      const tradeWithManifest = {
        ...BASE_TRADE,
        manifest: {
          expectedDeliveryAt: new Date("2026-01-19T14:00:00.000Z"),
          createdAt: new Date("2026-01-17T08:00:00.000Z"),
        },
      };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(tradeWithManifest) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasManifest).toBe(true);
      expect(res.body.manifestSchedule).toBeDefined();
      // Sensitive manifest fields must not appear anywhere.
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("driverName");
      expect(body).not.toContain("driverIdNumber");
      expect(body).not.toContain("vehicleRegistration");
      expect(body).not.toContain("routeDescription");
    });

    it("does not include note content", async () => {
      const tradeWithNotes = {
        ...BASE_TRADE,
        notes: [{ id: 1 }, { id: 2 }],
      };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(tradeWithNotes) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notesCount).toBe(2);
      expect(res.body).not.toHaveProperty("notes");
    });
  });

  describe("bundle structure", () => {
    it("includes all expected top-level fields", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("bundleVersion");
      expect(res.body).toHaveProperty("exportedAt");
      expect(res.body).toHaveProperty("requestedBy");
      expect(res.body).toHaveProperty("trade");
      expect(res.body).toHaveProperty("dispute");
      expect(res.body).toHaveProperty("evidenceCount");
      expect(res.body).toHaveProperty("notesCount");
      expect(res.body).toHaveProperty("hasManifest");
      expect(res.body).toHaveProperty("manifestSchedule");
      expect(res.body).toHaveProperty("releaseMilestones");
    });

    it("includes tradeId and status in trade section", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.trade.tradeId).toBe("trade-diag-001");
      expect(res.body.trade.status).toBe("FUNDED");
    });

    it("includes release milestones when present", async () => {
      const tradeWithMilestones = {
        ...BASE_TRADE,
        releaseMilestones: [
          {
            milestoneIndex: 0,
            amountUsdc: "2500",
            dueAt: new Date("2026-01-20T00:00:00.000Z"),
            releasedAt: null,
          },
          {
            milestoneIndex: 1,
            amountUsdc: "2500",
            dueAt: new Date("2026-02-01T00:00:00.000Z"),
            releasedAt: new Date("2026-02-02T10:00:00.000Z"),
          },
        ],
      };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(tradeWithMilestones) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.releaseMilestones).toHaveLength(2);
      expect(res.body.releaseMilestones[0].milestoneIndex).toBe(0);
    });

    it("sets hasManifest:false when no manifest exists", async () => {
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(BASE_TRADE) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasManifest).toBe(false);
      expect(res.body.manifestSchedule).toBeNull();
    });

    it("sets evidenceCount correctly", async () => {
      const tradeWithEvidence = {
        ...BASE_TRADE,
        evidence: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };
      const mockPrisma = {
        trade: { findFirst: jest.fn().mockResolvedValue(tradeWithEvidence) },
      } as any;
      const app = makeApp(mockPrisma);

      const res = await request(app)
        .get("/trades/trade-diag-001/diagnostic")
        .set("Authorization", `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.evidenceCount).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for the amountTier helper
// ---------------------------------------------------------------------------

describe("amountTier helper", () => {
  it.each([
    ["0", "unknown"],
    ["-5", "unknown"],
    ["NaN", "unknown"],
    ["50", "<100 USDC"],
    ["99.99", "<100 USDC"],
    ["100", "100–999 USDC"],
    ["999", "100–999 USDC"],
    ["1000", "1,000–9,999 USDC"],
    ["9999.99", "1,000–9,999 USDC"],
    ["10000", "10,000–99,999 USDC"],
    ["99999.99", "10,000–99,999 USDC"],
    ["100000", "100,000+ USDC"],
    ["999999", "100,000+ USDC"],
  ])("amountTier(%s) === %s", (input, expected) => {
    expect(amountTier(input)).toBe(expected);
  });
});
