import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";

jest.mock("../jobs/queue", () => ({
  reconciliationQueue: {},
  treasuryReconciliationQueue: {},
  piiScanQueue: {},
  webhookSecretPurgeQueue: {},
  pilotFeedbackSlaCheckQueue: {},
}));

jest.mock("../services/auth.service", () => ({
  AuthService: {
    validateToken: jest.fn(async (token: string) => require("jsonwebtoken").decode(token)),
    isTokenRevoked: jest.fn().mockResolvedValue(false),
  },
}));

import { createAdminJobsRouter, PausableQueue } from "../routes/admin.jobs.routes";
import { correlationIdMiddleware } from "../middleware/correlationId.middleware";

function fakeQueue(): PausableQueue & { paused: boolean } {
  const q = {
    paused: false,
    pause: jest.fn(async () => { q.paused = true; }),
    resume: jest.fn(async () => { q.paused = false; }),
    isPaused: jest.fn(async () => q.paused),
  };
  return q;
}

describe("Admin background-job pause controls", () => {
  const adminAddress = StellarSdk.Keypair.random().publicKey();
  const userAddress = StellarSdk.Keypair.random().publicKey();
  let adminToken: string;
  let userToken: string;
  let reconciliation: ReturnType<typeof fakeQueue>;
  let broken: PausableQueue;
  let app: express.Express;

  const sign = (walletAddress: string, jti: string) => {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { walletAddress, jti, iss: process.env.JWT_ISSUER, aud: process.env.JWT_AUDIENCE, nbf: now - 1 },
      process.env.JWT_SECRET || "test-secret-at-least-32-characters-long",
      { algorithm: "HS256" },
    );
  };

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
    adminToken = sign(adminAddress, "jobs-admin-jti");
    userToken = sign(userAddress, "jobs-user-jti");
  });

  beforeEach(() => {
    reconciliation = fakeQueue();
    const err = new Error("redis down");
    broken = {
      pause: jest.fn().mockRejectedValue(err),
      resume: jest.fn().mockRejectedValue(err),
      isPaused: jest.fn().mockRejectedValue(err),
    };
    app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use(createAdminJobsRouter({ reconciliation, broken }));
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/admin/jobs/reconciliation/pause");
    expect(res.status).toBe(401);
    expect(reconciliation.pause).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    const res = await request(app).post("/api/admin/jobs/reconciliation/pause").set(auth(userToken));
    expect(res.status).toBe(403);
    expect(reconciliation.pause).not.toHaveBeenCalled();
  });

  it("pauses, reports status, and resumes a job", async () => {
    let res = await request(app).post("/api/admin/jobs/reconciliation/pause").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ job: "reconciliation", paused: true });

    res = await request(app).get("/api/admin/jobs/reconciliation/status").set(auth(adminToken));
    expect(res.body).toEqual({ job: "reconciliation", paused: true });

    res = await request(app).post("/api/admin/jobs/reconciliation/resume").set(auth(adminToken));
    expect(res.body).toEqual({ job: "reconciliation", paused: false });
    expect(reconciliation.resume).toHaveBeenCalledTimes(1);
  });

  it("lists status for all controllable jobs", async () => {
    reconciliation.paused = true;
    const res = await request(app).get("/api/admin/jobs").set(auth(adminToken));
    // one broken queue makes the aggregate fail closed
    expect(res.status).toBe(503);

    const healthy = express();
    healthy.use(createAdminJobsRouter({ reconciliation }));
    const ok = await request(healthy).get("/api/admin/jobs").set(auth(adminToken));
    expect(ok.body).toEqual({ jobs: [{ job: "reconciliation", paused: true }] });
  });

  it("returns 404 for unknown or prototype job names", async () => {
    for (const name of ["nope", "__proto__", "constructor"]) {
      const res = await request(app).post(`/api/admin/jobs/${name}/pause`).set(auth(adminToken));
      expect(res.status).toBe(404);
    }
  });

  it("returns 503 without leaking internals when the queue backend fails", async () => {
    for (const path of ["/api/admin/jobs/broken/pause", "/api/admin/jobs/broken/resume"]) {
      const res = await request(app).post(path).set(auth(adminToken));
      expect(res.status).toBe(503);
      expect(JSON.stringify(res.body)).not.toContain("redis down");
    }
    const status = await request(app).get("/api/admin/jobs/broken/status").set(auth(adminToken));
    expect(status.status).toBe(503);
  });
});
