/**
 * Additional guardrail tests for the batch trade status update route (issue #455).
 *
 * Core happy-path and auth tests live in admin.trades.batch.routes.test.ts.
 * This file covers the new guardrail additions:
 *   - reason required for CANCELLED and COMPLETED targets
 *   - dryRun mode (validates without committing)
 *   - dryRun skips adminActionAudit.create
 */

import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { PrismaClient, TradeStatus } from "@prisma/client";
import { createAdminTradeBatchRouter } from "../routes/admin.trades.batch.routes";
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

describe("Admin Trade Batch Guardrails", () => {
  const adminAddress = StellarSdk.Keypair.random().publicKey();
  let adminToken: string;

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
    const secret = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
    const now = Math.floor(Date.now() / 1000);
    adminToken = jwt.sign(
      {
        walletAddress: adminAddress,
        jti: "guardrail-admin-jti",
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
        nbf: now - 1,
      },
      secret,
      { algorithm: "HS256" },
    );
  });

  beforeEach(() => {
    jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Reason requirement guardrail
  // ---------------------------------------------------------------------------

  it("rejects CANCELLED transition without a reason", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [{ tradeId: "trade-1", status: TradeStatus.CANCELLED }],
      });

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toEqual([]);
    expect(res.body.failed[0].reason).toMatch(/reason is required/i);
  });

  it("rejects COMPLETED transition without a reason", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [{ tradeId: "trade-1", status: TradeStatus.COMPLETED }],
      });

    expect(res.status).toBe(200);
    expect(res.body.failed[0].reason).toMatch(/reason is required/i);
  });

  it("accepts CANCELLED transition with a reason", async () => {
    (mockPrisma.trade.findFirst as jest.Mock).mockResolvedValueOnce({
      tradeId: "trade-1",
      status: TradeStatus.FUNDED,
      version: 1,
    });
    (mockPrisma.trade.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [
          { tradeId: "trade-1", status: TradeStatus.CANCELLED, reason: "Admin override" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toEqual(["trade-1"]);
    expect(res.body.failed).toEqual([]);
  });

  it("does not require a reason for FUNDED transition", async () => {
    (mockPrisma.trade.findFirst as jest.Mock).mockResolvedValueOnce({
      tradeId: "trade-1",
      status: TradeStatus.CREATED,
      version: 1,
    });
    (mockPrisma.trade.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [{ tradeId: "trade-1", status: TradeStatus.FUNDED }],
      });

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toEqual(["trade-1"]);
  });

  // ---------------------------------------------------------------------------
  // Dry-run mode
  // ---------------------------------------------------------------------------

  it("dry-run returns succeeded without committing to DB", async () => {
    (mockPrisma.trade.findFirst as jest.Mock).mockResolvedValueOnce({
      tradeId: "trade-1",
      status: TradeStatus.CREATED,
      version: 1,
    });

    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [{ tradeId: "trade-1", status: TradeStatus.FUNDED }],
        dryRun: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.succeeded).toEqual(["trade-1"]);
    // No DB write performed
    expect(mockPrisma.trade.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.adminActionAudit.create).not.toHaveBeenCalled();
  });

  it("dry-run still validates transitions and reports failures", async () => {
    (mockPrisma.trade.findFirst as jest.Mock).mockResolvedValueOnce({
      tradeId: "trade-1",
      status: TradeStatus.COMPLETED,
      version: 1,
    });

    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [
          { tradeId: "trade-1", status: TradeStatus.FUNDED },
        ],
        dryRun: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.failed[0].reason).toMatch(/invalid transition/i);
    expect(mockPrisma.trade.updateMany).not.toHaveBeenCalled();
  });

  it("dry-run still enforces reason requirement", async () => {
    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [{ tradeId: "trade-1", status: TradeStatus.CANCELLED }],
        dryRun: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.failed[0].reason).toMatch(/reason is required/i);
  });

  it("response includes dryRun: false when not set", async () => {
    (mockPrisma.trade.findFirst as jest.Mock).mockResolvedValueOnce({
      tradeId: "trade-1",
      status: TradeStatus.CREATED,
      version: 1,
    });
    (mockPrisma.trade.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post("/api/admin/trades/batch/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updates: [{ tradeId: "trade-1", status: TradeStatus.FUNDED }],
      });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
  });
});
