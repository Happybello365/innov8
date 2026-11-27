/**
 * Tests for the API key scope simulator (#476).
 *
 * Covers:
 *  - POST /api/admin/api-keys/simulate  — single-action dry-run
 *  - POST /api/admin/api-keys/simulate/batch — multi-action dry-run
 *  - GET  /api/admin/api-keys/actions — discovery list
 *  - Authorization: non-admin is rejected with 403
 *  - Validation: malformed bodies are rejected with 400
 *  - Security: no secrets or PII in responses
 */

import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createAdminApiKeyScopeRouter } from "../routes/admin.apiKeyScope.routes";
import { AuthService } from "../services/auth.service";
import { errorHandler } from "../middleware/errorHandler";

jest.mock("../services/auth.service", () => ({
  AuthService: {
    validateToken: jest.fn(async (token: string) => {
      const j = require("jsonwebtoken");
      return j.decode(token);
    }),
    isTokenRevoked: jest.fn().mockResolvedValue(false),
  },
}));

const app = express();
app.use(express.json());
app.use("/", createAdminApiKeyScopeRouter());
app.use(errorHandler);

const adminAddress = StellarSdk.Keypair.random().publicKey();
const nonAdminAddress = StellarSdk.Keypair.random().publicKey();

function makeToken(walletAddress: string): string {
  const secret = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { walletAddress, jti: `jti-${Math.random()}`, iat: now - 1, exp: now + 3600 },
    secret,
    { algorithm: "HS256" },
  );
}

let adminToken: string;
let nonAdminToken: string;

beforeAll(() => {
  process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
  adminToken = makeToken(adminAddress);
  nonAdminToken = makeToken(nonAdminAddress);
});

beforeEach(() => {
  jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Authorization ────────────────────────────────────────────────────────────

describe("Authorization", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .send({ scopes: ["trades:read"], action: "trades:read" });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin with 403", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ scopes: ["trades:read"], action: "trades:read" });
    expect(res.status).toBe(403);
  });

  it("allows admin requests", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], action: "trades:read" });
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/admin/api-keys/simulate ───────────────────────────────────────

describe("POST /api/admin/api-keys/simulate", () => {
  it("returns allowed when scope matches exactly", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read", "evidence:upload"], action: "evidence:upload" });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("allowed");
    expect(res.body.action).toBe("evidence:upload");
    expect(res.body.matchedScopes).toContain("evidence:upload");
    expect(res.body.dryRun).toBe(true);
  });

  it("returns denied when no scope matches", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], action: "trades:write" });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("denied");
    expect(res.body.matchedScopes).toHaveLength(0);
    expect(typeof res.body.deniedReason).toBe("string");
    expect(res.body.dryRun).toBe(true);
  });

  it("admin:* wildcard grants any action", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["admin:*"], action: "evidence:upload" });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("allowed");
    expect(res.body.matchedScopes).toContain("admin:*");
  });

  it("resource wildcard grants all verbs on that resource", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:*"], action: "trades:write" });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("allowed");
  });

  it("resource wildcard does not bleed across resources", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:*"], action: "evidence:upload" });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("denied");
  });

  it("forwards optional context verbatim", async () => {
    const context = { keyId: "key-abc123", env: "staging" };
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], action: "trades:read", context });

    expect(res.status).toBe(200);
    expect(res.body.context).toEqual(context);
  });

  it("rejects body missing scopes with 400", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "trades:read" });
    expect(res.status).toBe(400);
  });

  it("rejects body missing action with 400", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"] });
    expect(res.status).toBe(400);
  });

  it("rejects malformed action format with 400", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], action: "nocolon" });
    expect(res.status).toBe(400);
  });

  it("does not leak secrets in response", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], action: "trades:write" });

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/JWT_SECRET|ADMIN_SECRET|password|secret/i);
  });
});

// ─── POST /api/admin/api-keys/simulate/batch ─────────────────────────────────

describe("POST /api/admin/api-keys/simulate/batch", () => {
  it("returns one result per action", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate/batch")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], actions: ["trades:read", "trades:write", "evidence:upload"] });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.dryRun).toBe(true);

    expect(res.body.results[0].verdict).toBe("allowed");
    expect(res.body.results[1].verdict).toBe("denied");
    expect(res.body.results[2].verdict).toBe("denied");
  });

  it("rejects empty actions array with 400", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate/batch")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scopes: ["trades:read"], actions: [] });
    expect(res.status).toBe(400);
  });

  it("rejects non-admin with 403", async () => {
    const res = await request(app)
      .post("/api/admin/api-keys/simulate/batch")
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ scopes: ["trades:read"], actions: ["trades:read"] });
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/admin/api-keys/actions ─────────────────────────────────────────

describe("GET /api/admin/api-keys/actions", () => {
  it("returns a sorted list of known actions", async () => {
    const res = await request(app)
      .get("/api/admin/api-keys/actions")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.count).toBe(res.body.actions.length);
    expect(res.body.actions).toContain("trades:read");
    expect(res.body.actions).toContain("admin:*" in res.body.actions ? "admin:*" : "trades:write");
  });

  it("rejects non-admin with 403", async () => {
    const res = await request(app)
      .get("/api/admin/api-keys/actions")
      .set("Authorization", `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Service unit tests ───────────────────────────────────────────────────────

import { ApiKeyScopeService } from "../services/apiKeyScope.service";

describe("ApiKeyScopeService", () => {
  const svc = new ApiKeyScopeService();

  it("allows exact scope match", () => {
    const r = svc.simulate({ scopes: ["trades:read"], action: "trades:read" });
    expect(r.verdict).toBe("allowed");
    expect(r.dryRun).toBe(true);
  });

  it("denies when no scope matches", () => {
    const r = svc.simulate({ scopes: ["trades:read"], action: "trades:write" });
    expect(r.verdict).toBe("denied");
    expect(r.deniedReason).toBeDefined();
  });

  it("admin:* allows all actions", () => {
    const r = svc.simulate({ scopes: ["admin:*"], action: "evidence:upload" });
    expect(r.verdict).toBe("allowed");
    expect(r.matchedScopes).toContain("admin:*");
  });

  it("resource wildcard allows all verbs on resource", () => {
    const r = svc.simulate({ scopes: ["evidence:*"], action: "evidence:upload" });
    expect(r.verdict).toBe("allowed");
  });

  it("resource wildcard does not cross resource boundaries", () => {
    const r = svc.simulate({ scopes: ["evidence:*"], action: "trades:write" });
    expect(r.verdict).toBe("denied");
  });

  it("simulateBatch returns results in order", () => {
    const results = svc.simulateBatch(["trades:read"], ["trades:read", "trades:write"]);
    expect(results[0].verdict).toBe("allowed");
    expect(results[1].verdict).toBe("denied");
  });

  it("listKnownActions returns sorted array", () => {
    const actions = svc.listKnownActions();
    expect(actions).toEqual([...actions].sort());
    expect(actions.includes("trades:read")).toBe(true);
  });
});
