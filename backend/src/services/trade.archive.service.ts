/**
 * Trade archive lifecycle service (#454).
 *
 * Provides safe archive and restore operations for closed trades. Only trades
 * in terminal states (COMPLETED, CANCELLED, EXPIRED) may be archived; active
 * trades are rejected. Every state transition is recorded in the audit trail
 * via appLogger so there is a complete, searchable record.
 *
 * Access rules:
 *   - Either party of the trade (buyer or seller) may archive/restore it.
 *   - Admin wallet addresses (ADMIN_STELLAR_PUBKEYS) may also archive/restore.
 *
 * Archive does NOT delete the trade. The record remains in the database with
 * `archivedAt` set, excluded from default list results but retrievable via
 * GET /trades/:id by an authorised party or admin.
 */

import { PrismaClient, TradeStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { appLogger } from "../middleware/logger";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { getAdminAllowlistLowercase } from "../lib/accessControl";

/** Terminal statuses that may be archived. Active trades must not be archived. */
const ARCHIVABLE_STATUSES = new Set<TradeStatus>([
  TradeStatus.COMPLETED,
  TradeStatus.CANCELLED,
  TradeStatus.EXPIRED,
]);

export class TradeArchiveNotFoundError extends AppError {
  constructor() {
    super(ErrorCode.TRADE_NOT_FOUND, "Trade not found", 404);
  }
}

export class TradeArchiveAccessDeniedError extends AppError {
  constructor() {
    super(ErrorCode.TRADE_ACCESS_DENIED, "Access to this trade is denied", 403);
  }
}

export class TradeArchiveInvalidStatusError extends AppError {
  constructor(status: TradeStatus) {
    super(
      ErrorCode.TRADE_INVALID_STATUS,
      `Only completed, cancelled, or expired trades may be archived (current status: ${status})`,
      400,
    );
  }
}

export class TradeAlreadyArchivedError extends AppError {
  constructor() {
    super(ErrorCode.TRADE_INVALID_STATUS, "Trade is already archived", 409);
  }
}

export class TradeNotArchivedError extends AppError {
  constructor() {
    super(ErrorCode.TRADE_INVALID_STATUS, "Trade is not archived", 409);
  }
}

type ArchivableDb = Pick<PrismaClient, "trade">;

export class TradeArchiveService {
  constructor(private readonly prisma: ArchivableDb = defaultPrisma) {}

  private isPartyOrAdmin(trade: { buyerAddress: string; sellerAddress: string }, caller: string): boolean {
    const lower = caller.toLowerCase();
    return (
      trade.buyerAddress.toLowerCase() === lower ||
      trade.sellerAddress.toLowerCase() === lower ||
      getAdminAllowlistLowercase().has(lower)
    );
  }

  /**
   * Archives a closed trade. Idempotent-safe: re-archiving an already-archived
   * trade returns a 409 with a clear message.
   */
  async archiveTrade(tradeId: string, callerAddress: string) {
    const trade = await this.prisma.trade.findFirst({
      where: { OR: [{ tradeId }, { id: Number.isInteger(Number(tradeId)) ? Number(tradeId) : undefined }] },
    });

    if (!trade) throw new TradeArchiveNotFoundError();
    if (!this.isPartyOrAdmin(trade, callerAddress)) throw new TradeArchiveAccessDeniedError();
    if (!ARCHIVABLE_STATUSES.has(trade.status)) throw new TradeArchiveInvalidStatusError(trade.status);
    if (trade.archivedAt !== null) throw new TradeAlreadyArchivedError();

    const updated = await this.prisma.trade.update({
      where: { tradeId: trade.tradeId },
      data: {
        archivedAt: new Date(),
        archivedBy: callerAddress,
      },
    });

    appLogger.info(
      {
        event: "trade.archived",
        tradeId: trade.tradeId,
        actor: callerAddress,
        status: trade.status,
      },
      "Trade archived",
    );

    return updated;
  }

  /**
   * Restores an archived trade back to the active listing. Returns 409 if
   * the trade is not currently archived.
   */
  async restoreTrade(tradeId: string, callerAddress: string) {
    const trade = await this.prisma.trade.findFirst({
      where: { OR: [{ tradeId }, { id: Number.isInteger(Number(tradeId)) ? Number(tradeId) : undefined }] },
    });

    if (!trade) throw new TradeArchiveNotFoundError();
    if (!this.isPartyOrAdmin(trade, callerAddress)) throw new TradeArchiveAccessDeniedError();
    if (trade.archivedAt === null) throw new TradeNotArchivedError();

    const updated = await this.prisma.trade.update({
      where: { tradeId: trade.tradeId },
      data: {
        archivedAt: null,
        archivedBy: callerAddress,
      },
    });

    appLogger.info(
      {
        event: "trade.restored",
        tradeId: trade.tradeId,
        actor: callerAddress,
        status: trade.status,
      },
      "Trade restored from archive",
    );

    return updated;
  }

  /**
   * Lists archived trades for the caller (buyer or seller).
   */
  async listArchivedTrades(callerAddress: string, page = 1, limit = 20) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const where = {
      OR: [{ buyerAddress: callerAddress }, { sellerAddress: callerAddress }],
      NOT: { archivedAt: null },
    };

    const [items, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
        skip,
        take: safeLimit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }
}
