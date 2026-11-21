/**
 * Tests for WalletChallengeCleanupService (issue #456)
 */

import { WalletChallengeCleanupService, CHALLENGE_KEY_PREFIX } from "../services/walletChallengeCleanup.service";

const mockRedis = {
  scan: jest.fn(),
  ttl: jest.fn(),
  del: jest.fn(),
};

jest.mock("../lib/redis", () => ({
  redis: mockRedis,
}));

describe("WalletChallengeCleanupService", () => {
  let service: WalletChallengeCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WalletChallengeCleanupService();
  });

  it("deletes keys with TTL === -1 (no expiry)", async () => {
    mockRedis.scan.mockResolvedValueOnce(["0", [`${CHALLENGE_KEY_PREFIX}addr1`]]);
    mockRedis.ttl.mockResolvedValueOnce(-1);
    mockRedis.del.mockResolvedValue(1);

    const result = await service.cleanupStaleChallenges();

    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.errors).toBe(0);
    expect(mockRedis.del).toHaveBeenCalledWith(`${CHALLENGE_KEY_PREFIX}addr1`);
  });

  it("deletes keys with TTL === 0 (expired but not evicted)", async () => {
    mockRedis.scan.mockResolvedValueOnce(["0", [`${CHALLENGE_KEY_PREFIX}addr2`]]);
    mockRedis.ttl.mockResolvedValueOnce(0);
    mockRedis.del.mockResolvedValue(1);

    const result = await service.cleanupStaleChallenges();

    expect(result.deleted).toBe(1);
  });

  it("skips keys with positive TTL (still live)", async () => {
    mockRedis.scan.mockResolvedValueOnce(["0", [`${CHALLENGE_KEY_PREFIX}addr3`]]);
    mockRedis.ttl.mockResolvedValueOnce(240);

    const result = await service.cleanupStaleChallenges();

    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(0);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("skips keys with TTL === -2 (already evicted)", async () => {
    mockRedis.scan.mockResolvedValueOnce(["0", [`${CHALLENGE_KEY_PREFIX}addr4`]]);
    mockRedis.ttl.mockResolvedValueOnce(-2);

    const result = await service.cleanupStaleChallenges();

    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(0);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("handles multiple SCAN pages", async () => {
    // First page returns cursor "1" (not done), second returns "0" (done)
    mockRedis.scan
      .mockResolvedValueOnce(["1", [`${CHALLENGE_KEY_PREFIX}addr1`]])
      .mockResolvedValueOnce(["0", [`${CHALLENGE_KEY_PREFIX}addr2`]]);
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.del.mockResolvedValue(1);

    const result = await service.cleanupStaleChallenges();

    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(2);
    expect(mockRedis.scan).toHaveBeenCalledTimes(2);
  });

  it("counts errors but continues on per-key failures", async () => {
    mockRedis.scan.mockResolvedValueOnce(["0", [
      `${CHALLENGE_KEY_PREFIX}addr1`,
      `${CHALLENGE_KEY_PREFIX}addr2`,
    ]]);
    mockRedis.ttl
      .mockRejectedValueOnce(new Error("redis timeout"))
      .mockResolvedValueOnce(-1);
    mockRedis.del.mockResolvedValue(1);

    const result = await service.cleanupStaleChallenges();

    expect(result.scanned).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(1); // second key succeeds
  });

  it("handles empty scan results", async () => {
    mockRedis.scan.mockResolvedValueOnce(["0", []]);

    const result = await service.cleanupStaleChallenges();

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("counts scan error and breaks loop", async () => {
    mockRedis.scan.mockRejectedValueOnce(new Error("connection refused"));

    const result = await service.cleanupStaleChallenges();

    expect(result.errors).toBe(1);
    expect(result.scanned).toBe(0);
  });
});
