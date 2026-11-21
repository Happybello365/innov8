/**
 * Tests for SessionAnomalyService (issue #457)
 */

import { SessionAnomalyService } from "../services/sessionAnomaly.service";
import type { Request } from "express";
import type { JWTPayload } from "../services/auth.service";

// Mock Redis pipeline
const mockPipelineExec = jest.fn();
const mockPipeline = {
  incr: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: mockPipelineExec,
};
const mockRedis = {
  pipeline: jest.fn(() => mockPipeline),
};

jest.mock("../lib/redis", () => ({ redis: mockRedis }));

jest.mock("../lib/deviceContext", () => ({
  deviceFingerprint: jest.fn(() => "hash-abc"),
  ipPrefixClass: jest.fn(() => "v4/192.168.1.0/24"),
}));

jest.mock("../config/env", () => ({
  runtimeEnvValue: jest.fn(() => 24),
  env: {},
}));

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: { "user-agent": "Mozilla/5.0" },
    ip: "192.168.1.5",
    ...overrides,
  } as unknown as Request;
}

function makePayload(overrides: Partial<JWTPayload> = {}): JWTPayload {
  return {
    sub: "user1",
    walletAddress: "GADDR1",
    jti: "test-jti",
    tv: 1,
    ...overrides,
  };
}

describe("SessionAnomalyService", () => {
  let service: SessionAnomalyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionAnomalyService();
    // Default: request count = 1 (below threshold)
    mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]]);
  });

  it("returns no anomalies when everything matches", async () => {
    const payload = makePayload({ ipClass: "v4/192.168.1.0/24", deviceHash: "hash-abc" });
    const result = await service.inspect(makeRequest(), payload);
    expect(result.anomalyDetected).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("fires ip_class_change when IP prefix differs", async () => {
    const { ipPrefixClass } = require("../lib/deviceContext");
    ipPrefixClass.mockReturnValue("v4/10.0.0.0/24");

    const payload = makePayload({ ipClass: "v4/192.168.1.0/24" });
    const result = await service.inspect(makeRequest(), payload);

    expect(result.anomalyDetected).toBe(true);
    expect(result.signals).toContain("ip_class_change");
  });

  it("does not fire ip_class_change when payload has no ipClass", async () => {
    const { ipPrefixClass } = require("../lib/deviceContext");
    ipPrefixClass.mockReturnValue("v4/10.0.0.0/24");

    const payload = makePayload(); // no ipClass
    const result = await service.inspect(makeRequest(), payload);

    expect(result.signals).not.toContain("ip_class_change");
  });

  it("fires user_agent_change when device fingerprint differs", async () => {
    const { deviceFingerprint } = require("../lib/deviceContext");
    deviceFingerprint.mockReturnValue("hash-xyz");

    const payload = makePayload({ deviceHash: "hash-abc" });
    const result = await service.inspect(makeRequest(), payload);

    expect(result.anomalyDetected).toBe(true);
    expect(result.signals).toContain("user_agent_change");
  });

  it("does not fire user_agent_change when payload has no deviceHash", async () => {
    const { deviceFingerprint } = require("../lib/deviceContext");
    deviceFingerprint.mockReturnValue("hash-xyz");

    const payload = makePayload(); // no deviceHash
    const result = await service.inspect(makeRequest(), payload);

    expect(result.signals).not.toContain("user_agent_change");
  });

  it("fires rapid_token_reuse when request count exceeds threshold", async () => {
    mockPipelineExec.mockResolvedValue([[null, 150], [null, 1]]); // 150 > 120

    const payload = makePayload();
    const result = await service.inspect(makeRequest(), payload);

    expect(result.anomalyDetected).toBe(true);
    expect(result.signals).toContain("rapid_token_reuse");
  });

  it("does not fire rapid_token_reuse at the threshold boundary", async () => {
    mockPipelineExec.mockResolvedValue([[null, 120], [null, 1]]); // 120 == MAX, not >

    const payload = makePayload();
    const result = await service.inspect(makeRequest(), payload);

    expect(result.signals).not.toContain("rapid_token_reuse");
  });

  it("can fire multiple signals at once", async () => {
    const { ipPrefixClass, deviceFingerprint } = require("../lib/deviceContext");
    ipPrefixClass.mockReturnValue("v4/10.0.0.0/24");
    deviceFingerprint.mockReturnValue("hash-xyz");
    mockPipelineExec.mockResolvedValue([[null, 200], [null, 1]]);

    const payload = makePayload({
      ipClass: "v4/192.168.1.0/24",
      deviceHash: "hash-abc",
    });
    const result = await service.inspect(makeRequest(), payload);

    expect(result.signals).toContain("ip_class_change");
    expect(result.signals).toContain("user_agent_change");
    expect(result.signals).toContain("rapid_token_reuse");
  });

  it("swallows errors and returns empty result on Redis failure", async () => {
    mockPipelineExec.mockRejectedValue(new Error("redis down"));

    const payload = makePayload();
    const result = await service.inspect(makeRequest(), payload);

    // The rapid_reuse check failed — no signal, no throw
    expect(result.anomalyDetected).toBe(false);
    expect(result.signals).not.toContain("rapid_token_reuse");
  });

  it("returns empty result on unexpected error", async () => {
    const { deviceFingerprint } = require("../lib/deviceContext");
    deviceFingerprint.mockImplementation(() => { throw new Error("crash"); });

    const payload = makePayload({ deviceHash: "hash-abc" });
    // Should not throw
    const result = await service.inspect(makeRequest(), payload);
    expect(result.signals).not.toContain("user_agent_change");
  });
});
