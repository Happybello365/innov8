import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { PrismaClient, TradeStatus } from "@prisma/client";
import { createAdminTradeBatchRouter } from "../routes/admin.trades.batch.routes";
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

// Avoid pulling in the real Redis-backed adminSession service which has a
// pre-existing TS2339 compilation error on the ioredis types (not introduced
// by this change — the same error breaks the adjacent admin.trades.batch.routes.test.ts).
jest.mock("../services/adminSession.service", () => ({
  adminSessionService: {
    isTokenRevoked: jest.fn().mockResolvedValue(false),
  },
}));

const mockPrisma = {
  trade: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  adminActionAudit: {
    create: jest.fn().mockResolvedValue({}),
  },
} as unknown as PrismaClient & {
  trade: { findFirst: jest.Mock; updateMany: jest.Mock };
  adminActionAudit: { create: jest.Mock };
};

const app = express();
app.use(express.json());
app.use("/", createAdminTradeBatchRouter(mockPrisma));
app.use(errorHandler);

describe("POST /api/admin/trades/batch/status/preview", () => {
  const adminAddress = StellarSdk.Keypair.random().publicKey();
  const nonAdminAddress = StellarSdk.Keypair.random().publicKey();
  let adminToken: string;
  let nonAdminToken: string;

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
    const secret = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
    const now = Math.floor(Date.now() / 1000);
    adminToken = jwt.sign(
      {
        walletAddress: adminAddress,
        jti: "preview-admin-jti",
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
        nbf: now - 1,
      },
      secret,
      { algorithm: "HS256" },
    );
    nonAdminToken = jwt.sign(
      {
        walletAddress: nonAdminAddress,
        jti: "preview-nonadmin-jti",
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
        nbf: now - 1,
      },
      secret,
      { algorithm: "HS256" },
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns wouldSucceed and wouldFail without writing to the database", async () => {
    mockPrisma.trade.findFirst
      .mockResolvedValueOnce({ tradeId: "trade-1", status: TradeStatus.CREATED, version: 5 })
      .mockResolvedValueOnce({ tradeId: "trade-2", status: TradeStatus.FUNDED, version: 3 });

    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [
          { tradeId: "trade-1", status: TradeStatus.CANCELLED },
          { tradeId: "trade-2", status: TradeStatus.CANCELLED },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.wouldSucceed).toEqual([
      { tradeId: "trade-1", currentStatus: TradeStatus.CREATED, targetStatus: TradeStatus.CANCELLED },
      { tradeId: "trade-2", currentStatus: TradeStatus.FUNDED, targetStatus: TradeStatus.CANCELLED },
    ]);
    expect(res.body.wouldFail).toEqual([]);

    // Preview must never write
    expect(mockPrisma.trade.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.adminActionAudit.create).not.toHaveBeenCalled();
  });

  it("surfaces trade-not-found and invalid-transition failures without writing", async () => {
    mockPrisma.trade.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tradeId: "trade-2", status: TradeStatus.COMPLETED, version: 1 });

    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [
          { tradeId: "unknown", status: TradeStatus.CANCELLED },
          { tradeId: "trade-2", status: TradeStatus.CANCELLED },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.wouldSucceed).toEqual([]);
    expect(res.body.wouldFail).toHaveLength(2);
    expect(res.body.wouldFail[0]).toEqual({ tradeId: "unknown", reason: "Trade not found" });
    expect(res.body.wouldFail[1]).toEqual({
      tradeId: "trade-2",
      reason: "Invalid transition from COMPLETED to CANCELLED",
    });

    expect(mockPrisma.trade.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.adminActionAudit.create).not.toHaveBeenCalled();
  });

  it("includes currentStatus and targetStatus in wouldSucceed entries", async () => {
    mockPrisma.trade.findFirst.mockResolvedValueOnce({
      tradeId: "trade-X",
      status: TradeStatus.FUNDED,
      version: 2,
    });

    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ updates: [{ tradeId: "trade-X", status: TradeStatus.DELIVERED }] });

    expect(res.status).toBe(200);
    expect(res.body.wouldSucceed[0]).toMatchObject({
      tradeId: "trade-X",
      currentStatus: TradeStatus.FUNDED,
      targetStatus: TradeStatus.DELIVERED,
    });
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .send({ updates: [{ tradeId: "trade-1", status: TradeStatus.CANCELLED }] });

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ updates: [{ tradeId: "trade-1", status: TradeStatus.CANCELLED }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden: admin access required");
  });

  it("returns 400 for empty updates array", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ updates: [] });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid status value", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ updates: [{ tradeId: "trade-1", status: "NOT_A_STATUS" }] });

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing tradeId", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ updates: [{ status: TradeStatus.CANCELLED }] });

    expect(res.status).toBe(400);
  });
});
