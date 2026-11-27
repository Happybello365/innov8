/**
 * Tests for the audit export endpoints added to admin.audit.routes.ts:
 *   POST /api/admin/audit/export
 *   GET  /api/admin/audit/export/:id
 */
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createAdminAuditRouter } from "../routes/admin.audit.routes";
import { errorHandler } from "../middleware/errorHandler";
import { AuditExportStatus } from "../services/auditExport.service";

// ── Auth mock ───────────────────────────────────────────────────────────────
jest.mock("../services/auth.service", () => {
  const actual = jest.requireActual("../services/auth.service");
  return {
    ...actual,
    AuthService: {
      validateToken: jest.fn(async (token: string) => {
        const jsonwebtoken = require("jsonwebtoken");
        return jsonwebtoken.decode(token);
      }),
      isTokenRevoked: jest.fn().mockResolvedValue(false),
    },
  };
});

// ── Admin audit service mock (keep existing tests happy) ───────────────────
jest.mock("../services/adminAudit.service", () => ({
  adminAuditService: { list: jest.fn(), verifyChain: jest.fn() },
}));

// ── Queue mock ─────────────────────────────────────────────────────────────
jest.mock("../jobs/queue", () => ({
  auditExportQueue: {
    add: jest.fn().mockResolvedValue({ id: "job-999" }),
  },
}));

import { AuthService } from "../services/auth.service";
import { auditExportQueue } from "../jobs/queue";

const mockQueue = auditExportQueue as unknown as { add: jest.Mock };

// ── Shared export service mock ─────────────────────────────────────────────
const NOW = new Date("2026-10-17T12:00:00.000Z");

const mockExportService = {
  create: jest.fn().mockResolvedValue({ exportId: "export-uuid-1", rowId: 1 }),
  attachJobId: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  markGenerating: jest.fn(),
  markReady: jest.fn(),
  markFailed: jest.fn(),
  expireStale: jest.fn(),
};

// ── Express app ────────────────────────────────────────────────────────────
const adminAddress = StellarSdk.Keypair.random().publicKey();
const otherAddress = StellarSdk.Keypair.random().publicKey();

const app = express();
app.use(express.json());
app.use("/", createAdminAuditRouter(mockExportService as any));
app.use(errorHandler);

function mintToken(walletAddress: string, jti: string) {
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

describe("POST /api/admin/audit/export", () => {
  let adminToken: string;
  let nonAdminToken: string;

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
    adminToken = mintToken(adminAddress, "export-admin-jti");
    nonAdminToken = mintToken(otherAddress, "export-other-jti");
  });

  beforeEach(() => {
    jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
    jest.clearAllMocks();
    mockExportService.create.mockResolvedValue({ exportId: "export-uuid-1", rowId: 1 });
    mockQueue.add.mockResolvedValue({ id: "job-999" });
    mockExportService.attachJobId.mockResolvedValue(undefined);
  });

  it("returns 202 with exportId and QUEUED status for a valid admin", async () => {
    const res = await request(app)
      .post("/api/admin/audit/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ format: "json" });

    expect(res.status).toBe(202);
    expect(res.body.exportId).toBe("export-uuid-1");
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.message).toContain("/api/admin/audit/export/export-uuid-1");
  });

  it("enqueues a BullMQ job and attaches the jobId", async () => {
    await request(app)
      .post("/api/admin/audit/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ format: "csv" });

    expect(mockQueue.add).toHaveBeenCalledWith(
      "audit-export",
      expect.objectContaining({
        exportId: "export-uuid-1",
        requestedBy: adminAddress,
        format: "csv",
      }),
    );
    expect(mockExportService.attachJobId).toHaveBeenCalledWith("export-uuid-1", "job-999");
  });

  it("defaults format to json when body is empty", async () => {
    await request(app)
      .post("/api/admin/audit/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(mockExportService.create).toHaveBeenCalledWith(
      adminAddress,
      "json",
    );
  });

  it("accepts csv format", async () => {
    await request(app)
      .post("/api/admin/audit/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ format: "csv" });

    expect(mockExportService.create).toHaveBeenCalledWith(adminAddress, "csv");
  });

  it("rejects an invalid format with 400", async () => {
    const res = await request(app)
      .post("/api/admin/audit/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ format: "xml" });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/admin/audit/export")
      .send({ format: "json" });
    expect(res.status).toBe(401);
    expect(mockExportService.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin user", async () => {
    const res = await request(app)
      .post("/api/admin/audit/export")
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ format: "json" });
    expect(res.status).toBe(403);
    expect(mockExportService.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/audit/export/:id", () => {
  let adminToken: string;
  let nonAdminToken: string;

  const readyRecord = {
    exportId: "export-uuid-1",
    requestedBy: adminAddress,
    format: "json",
    status: AuditExportStatus.READY,
    rowCount: 10,
    data: '{"rows":[]}',
    s3Key: null,
    readyAt: NOW,
    expiredAt: null,
    expiresAt: new Date(NOW.getTime() + 3600 * 1000),
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
    adminToken = mintToken(adminAddress, "get-export-admin-jti");
    nonAdminToken = mintToken(otherAddress, "get-export-other-jti");
  });

  beforeEach(() => {
    jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
    jest.clearAllMocks();
  });

  it("returns READY record with data for the owner", async () => {
    mockExportService.get.mockResolvedValue(readyRecord);

    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.exportId).toBe("export-uuid-1");
    expect(res.body.status).toBe("READY");
    expect(res.body.rowCount).toBe(10);
    expect(res.body.data).toBe('{"rows":[]}');
  });

  it("returns QUEUED record without data", async () => {
    mockExportService.get.mockResolvedValue({
      ...readyRecord,
      status: AuditExportStatus.QUEUED,
      data: null,
      rowCount: null,
      readyAt: null,
    });

    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.data).toBeNull();
  });

  it("returns GENERATING record", async () => {
    mockExportService.get.mockResolvedValue({
      ...readyRecord,
      status: AuditExportStatus.GENERATING,
      data: null,
      rowCount: null,
      readyAt: null,
    });

    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("GENERATING");
  });

  it("returns EXPIRED record with errorMessage", async () => {
    mockExportService.get.mockResolvedValue({
      ...readyRecord,
      status: AuditExportStatus.EXPIRED,
      data: null,
      expiredAt: NOW,
      errorMessage: "Export job failed: DB timeout",
    });

    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("EXPIRED");
    expect(res.body.data).toBeNull();
    expect(res.body.errorMessage).toBe("Export job failed: DB timeout");
  });

  it("returns 404 when export is not found", async () => {
    const { AuditExportNotFoundError } = jest.requireActual("../services/auditExport.service");
    mockExportService.get.mockRejectedValue(new AuditExportNotFoundError());

    const res = await request(app)
      .get("/api/admin/audit/export/no-such-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 403 when export belongs to a different admin", async () => {
    const { AuditExportAccessDeniedError } = jest.requireActual("../services/auditExport.service");
    mockExportService.get.mockRejectedValue(new AuditExportAccessDeniedError());

    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1");
    expect(res.status).toBe(401);
    expect(mockExportService.get).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin user", async () => {
    const res = await request(app)
      .get("/api/admin/audit/export/export-uuid-1")
      .set("Authorization", `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
    expect(mockExportService.get).not.toHaveBeenCalled();
  });
});
