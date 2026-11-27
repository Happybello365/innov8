/**
 * Tests for AccountDeletionExportService (issue #458)
 */

import { AccountDeletionExportService } from "../services/accountDeletionExport.service";
import { AppError } from "../errors/errorCodes";

const mockSet = jest.fn().mockResolvedValue("OK");
const mockGet = jest.fn();
const mockDel = jest.fn().mockResolvedValue(1);
const mockRedis = { set: mockSet, get: mockGet, del: mockDel };

jest.mock("../lib/redis", () => ({ redis: mockRedis }));

function makeDb(userExists = true) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        userExists
          ? { walletAddress: "addr1", displayName: "Alice", createdAt: new Date() }
          : null,
      ),
    },
    trade: {
      findMany: jest.fn().mockResolvedValue([
        { tradeId: "t1", status: "COMPLETED", amountUsdc: "100", createdAt: new Date(), completedAt: new Date() },
      ]),
    },
    dispute: { findMany: jest.fn().mockResolvedValue([]) },
    vault: { findMany: jest.fn().mockResolvedValue([]) },
    goal: { findMany: jest.fn().mockResolvedValue([]) },
    tradeTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    userWatchlist: { findMany: jest.fn().mockResolvedValue([]) },
    webhookSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    inAppNotification: { findMany: jest.fn().mockResolvedValue([]) },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

describe("AccountDeletionExportService", () => {
  let service: AccountDeletionExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountDeletionExportService(makeDb() as any);
  });

  it("generates a snapshot with the correct structure", async () => {
    const snapshot = await service.generateDeletionExport("ADDR1");

    expect(snapshot.walletAddress).toBe("addr1"); // normalised to lowercase
    expect(snapshot.exportedAt).toBeDefined();
    expect(snapshot.profile).toBeDefined();
    expect(snapshot.trades.buyer).toHaveLength(1);
    expect(snapshot.trades.seller).toHaveLength(1);
    expect(Array.isArray(snapshot.disputes)).toBe(true);
    expect(Array.isArray(snapshot.vaults)).toBe(true);
  });

  it("caches the snapshot in Redis with TTL", async () => {
    await service.generateDeletionExport("ADDR1");

    expect(mockSet).toHaveBeenCalledWith(
      expect.stringContaining("deletion_export:addr1"),
      expect.any(String),
      "EX",
      expect.any(Number),
    );
  });

  it("throws NOT_FOUND when user does not exist", async () => {
    service = new AccountDeletionExportService(makeDb(false) as any);
    await expect(service.generateDeletionExport("UNKNOWN")).rejects.toBeInstanceOf(AppError);
  });

  it("getCachedExport returns null when cache is empty", async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await service.getCachedExport("addr1");
    expect(result).toBeNull();
  });

  it("getCachedExport returns parsed snapshot from Redis", async () => {
    const fake = { walletAddress: "addr1", exportedAt: new Date().toISOString(), trades: { buyer: [], seller: [] } };
    mockGet.mockResolvedValueOnce(JSON.stringify(fake));
    const result = await service.getCachedExport("addr1");
    expect(result?.walletAddress).toBe("addr1");
  });

  it("getCachedExport returns null on Redis error", async () => {
    mockGet.mockRejectedValueOnce(new Error("connection error"));
    const result = await service.getCachedExport("addr1");
    expect(result).toBeNull();
  });

  it("evictCachedExport deletes the Redis key", async () => {
    await service.evictCachedExport("addr1");
    expect(mockDel).toHaveBeenCalledWith(expect.stringContaining("deletion_export:addr1"));
  });

  it("still returns snapshot when Redis set fails", async () => {
    mockSet.mockRejectedValueOnce(new Error("redis down"));
    const snapshot = await service.generateDeletionExport("ADDR1");
    // Should not throw — snapshot still returned
    expect(snapshot.walletAddress).toBe("addr1");
  });

  it("normalises wallet address to lowercase", async () => {
    const snapshot = await service.generateDeletionExport("GADDR_UPPER");
    expect(snapshot.walletAddress).toBe("gaddr_upper");
  });
});
