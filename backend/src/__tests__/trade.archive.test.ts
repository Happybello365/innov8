/**
 * Tests for issue #454 — trade archive lifecycle endpoints.
 */
import {
  TradeArchiveService,
  TradeArchiveNotFoundError,
  TradeArchiveAccessDeniedError,
  TradeArchiveInvalidStatusError,
  TradeAlreadyArchivedError,
  TradeNotArchivedError,
} from "../services/trade.archive.service";
import { TradeStatus } from "@prisma/client";

function makeMockPrisma(tradeOverride: Partial<any> = {}) {
  const base = {
    id: 1,
    tradeId: "T-archive-1",
    buyerAddress: "GBUYER",
    sellerAddress: "GSELLER",
    status: TradeStatus.COMPLETED,
    archivedAt: null,
    archivedBy: null,
    version: 1,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
  const record = { ...base, ...tradeOverride };

  return {
    trade: {
      findFirst: jest.fn().mockResolvedValue(record),
      findMany: jest.fn().mockResolvedValue([record]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...record, ...data }),
      ),
    },
  };
}

describe("#454 TradeArchiveService", () => {
  describe("archiveTrade", () => {
    it("archives a completed trade successfully", async () => {
      const db = makeMockPrisma({ status: TradeStatus.COMPLETED, archivedAt: null });
      const svc = new TradeArchiveService(db as any);
      const result = await svc.archiveTrade("T-archive-1", "GBUYER");
      expect(db.trade.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ archivedBy: "GBUYER" }),
        }),
      );
      expect(result).toBeDefined();
    });

    it("archives a cancelled trade successfully", async () => {
      const db = makeMockPrisma({ status: TradeStatus.CANCELLED, archivedAt: null });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.archiveTrade("T-archive-1", "GBUYER")).resolves.toBeDefined();
    });

    it("archives an expired trade successfully", async () => {
      const db = makeMockPrisma({ status: TradeStatus.EXPIRED, archivedAt: null });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.archiveTrade("T-archive-1", "GBUYER")).resolves.toBeDefined();
    });

    it("throws TradeArchiveNotFoundError when trade does not exist", async () => {
      const db = makeMockPrisma();
      db.trade.findFirst = jest.fn().mockResolvedValue(null);
      const svc = new TradeArchiveService(db as any);
      await expect(svc.archiveTrade("MISSING", "GBUYER")).rejects.toBeInstanceOf(
        TradeArchiveNotFoundError,
      );
    });

    it("throws TradeArchiveAccessDeniedError for a non-party caller", async () => {
      const db = makeMockPrisma({ status: TradeStatus.COMPLETED, archivedAt: null });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.archiveTrade("T-archive-1", "GSTRANGER")).rejects.toBeInstanceOf(
        TradeArchiveAccessDeniedError,
      );
    });

    it("throws TradeArchiveInvalidStatusError for an active trade (FUNDED)", async () => {
      const db = makeMockPrisma({ status: TradeStatus.FUNDED, archivedAt: null });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.archiveTrade("T-archive-1", "GBUYER")).rejects.toBeInstanceOf(
        TradeArchiveInvalidStatusError,
      );
    });

    it("throws TradeAlreadyArchivedError when trade is already archived", async () => {
      const db = makeMockPrisma({
        status: TradeStatus.COMPLETED,
        archivedAt: new Date(),
      });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.archiveTrade("T-archive-1", "GBUYER")).rejects.toBeInstanceOf(
        TradeAlreadyArchivedError,
      );
    });
  });

  describe("restoreTrade", () => {
    it("restores an archived trade successfully", async () => {
      const db = makeMockPrisma({
        status: TradeStatus.COMPLETED,
        archivedAt: new Date(),
      });
      const svc = new TradeArchiveService(db as any);
      const result = await svc.restoreTrade("T-archive-1", "GBUYER");
      expect(db.trade.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ archivedAt: null }),
        }),
      );
      expect(result).toBeDefined();
    });

    it("throws TradeNotArchivedError when trade is not archived", async () => {
      const db = makeMockPrisma({ status: TradeStatus.COMPLETED, archivedAt: null });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.restoreTrade("T-archive-1", "GBUYER")).rejects.toBeInstanceOf(
        TradeNotArchivedError,
      );
    });

    it("throws TradeArchiveAccessDeniedError for a non-party caller", async () => {
      const db = makeMockPrisma({
        status: TradeStatus.COMPLETED,
        archivedAt: new Date(),
      });
      const svc = new TradeArchiveService(db as any);
      await expect(svc.restoreTrade("T-archive-1", "GSTRANGER")).rejects.toBeInstanceOf(
        TradeArchiveAccessDeniedError,
      );
    });

    it("throws TradeArchiveNotFoundError when trade does not exist", async () => {
      const db = makeMockPrisma();
      db.trade.findFirst = jest.fn().mockResolvedValue(null);
      const svc = new TradeArchiveService(db as any);
      await expect(svc.restoreTrade("MISSING", "GBUYER")).rejects.toBeInstanceOf(
        TradeArchiveNotFoundError,
      );
    });
  });

  describe("listArchivedTrades", () => {
    it("returns paginated archived trades for the caller", async () => {
      const db = makeMockPrisma({ archivedAt: new Date() });
      const svc = new TradeArchiveService(db as any);
      const result = await svc.listArchivedTrades("GBUYER");
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it("clamps limit to 100", async () => {
      const db = makeMockPrisma({ archivedAt: new Date() });
      const svc = new TradeArchiveService(db as any);
      await svc.listArchivedTrades("GBUYER", 1, 999);
      expect(db.trade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });
});
