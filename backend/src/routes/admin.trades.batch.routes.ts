import { PrismaClient, TradeStatus } from "@prisma/client";
import { Response, Router } from "express";
import { z } from "zod";
import { prisma as defaultPrisma } from "../lib/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { createAdminQuotaMiddleware } from "../middleware/adminQuota.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { getTraceContext } from "../middleware/tracing.middleware";
import { AuthRequest } from "../services/auth.service";
import { appLogger } from "../middleware/logger";
import { ADMIN_QUOTA_CONFIG } from "../config/adminQuota";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";

const tradeStatusUpdateSchema = z.object({
  tradeId: z.string().min(1, "tradeId is required"),
  status: z.nativeEnum(TradeStatus),
  /** Optional admin-supplied reason for audit log and sensitive transitions. */
  reason: z.string().max(500).optional(),
});

const batchStatusBodySchema = z.object({
  updates: z
    .array(tradeStatusUpdateSchema)
    .min(1, "At least one update is required")
    .max(100, "Maximum 100 updates per request"),
  /**
   * When true, validate all transitions and return a preview result without
   * committing any changes. Useful for reviewing a large batch before applying.
   */
  dryRun: z.boolean().default(false),
});

const VALID_TRANSITIONS: Record<TradeStatus, TradeStatus[]> = {
  [TradeStatus.PENDING_SIGNATURE]: [TradeStatus.CREATED, TradeStatus.CANCELLED],
  [TradeStatus.CREATED]: [TradeStatus.FUNDED, TradeStatus.CANCELLED],
  [TradeStatus.FUNDED]: [
    TradeStatus.DELIVERED,
    TradeStatus.DISPUTED,
    TradeStatus.CANCELLED,
  ],
  [TradeStatus.DELIVERED]: [
    TradeStatus.COMPLETED,
    TradeStatus.DISPUTED,
    TradeStatus.CANCELLED,
  ],
  [TradeStatus.DISPUTED]: [TradeStatus.COMPLETED, TradeStatus.CANCELLED],
  [TradeStatus.COMPLETED]: [],
  [TradeStatus.CANCELLED]: [],
  [TradeStatus.EXPIRED]: [],
};

/**
 * Statuses whose transitions require an explicit reason from the admin.
 * Transitions to these targets without a reason string are rejected.
 */
const REASON_REQUIRED_TARGETS = new Set<TradeStatus>([
  TradeStatus.CANCELLED,
  TradeStatus.COMPLETED,
]);

function isValidTransition(from: TradeStatus, to: TradeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);
const batchQueryLimiter = createWalletRateLimiter(RATE_LIMIT_CONFIG.batchQuery);

export function createAdminTradeBatchRouter(
  prisma: PrismaClient = defaultPrisma,
) {
  const router = Router();

  /**
   * POST /api/admin/trades/batch/status/preview
   *
   * Dry-run validation of a batch trade status update. Runs every check that
   * the real execution path runs (trade existence, valid transition, current
   * status) but does not write anything to the database or create an audit
   * record. The response mirrors the shape of the execution response so a
   * single confirmation modal can display exact affected records before the
   * admin confirms.
   *
   * Returns:
   *   - `wouldSucceed` — trades that would transition successfully
   *   - `wouldFail` — trades that would be rejected, with the reason
   *   - `preview: true` — sentinel so callers can distinguish from live responses
   */
  router.post(
    "/api/admin/trades/batch/status/preview",
    authMiddleware,
    batchQueryLimiter,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ body: batchStatusBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { updates } = req.body as {
          updates: { tradeId: string; status: TradeStatus }[];
        };

        const wouldSucceed: { tradeId: string; currentStatus: TradeStatus; targetStatus: TradeStatus }[] = [];
        const wouldFail: { tradeId: string; reason: string }[] = [];

        for (const { tradeId, status: targetStatus } of updates) {
          const trade = await prisma.trade.findFirst({
            where: {
              OR: [
                { tradeId },
                {
                  id: Number.isInteger(Number(tradeId)) ? Number(tradeId) : -1,
                },
              ],
            },
            select: { tradeId: true, status: true, version: true },
          });

          if (!trade) {
            wouldFail.push({ tradeId, reason: "Trade not found" });
            continue;
          }

          if (!isValidTransition(trade.status, targetStatus)) {
            wouldFail.push({
              tradeId,
              reason: `Invalid transition from ${trade.status} to ${targetStatus}`,
            });
            continue;
          }

          wouldSucceed.push({
            tradeId: trade.tradeId,
            currentStatus: trade.status,
            targetStatus,
          });
        }

        const traceCtx = getTraceContext();
        appLogger.info(
          {
            eventType: "BATCH_TRADE_STATUS_UPDATE_PREVIEW",
            actionName: "admin.trades.batch.status.preview",
            totalUpdates: updates.length,
            wouldSucceedCount: wouldSucceed.length,
            wouldFailCount: wouldFail.length,
            adminAddress: req.user?.walletAddress,
            traceId: traceCtx?.traceId,
            spanId: traceCtx?.spanId,
            timestamp: new Date().toISOString(),
          },
          `[AdminPreview] Batch trade status preview: ${wouldSucceed.length} would succeed, ${wouldFail.length} would fail`,
        );

        res.status(200).json({ wouldSucceed, wouldFail, preview: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/api/admin/trades/batch/status",
    authMiddleware,
    batchQueryLimiter,
    adminMiddleware,
    adminRateLimit,
    createAdminQuotaMiddleware(
      "admin.trades.batch.status",
      ADMIN_QUOTA_CONFIG.tradeBatchStatus,
    ),
    validateRequest({ body: batchStatusBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { updates, dryRun } = req.body as {
          updates: { tradeId: string; status: TradeStatus; reason?: string }[];
          dryRun: boolean;
        };

        const succeeded: string[] = [];
        const failed: { tradeId: string; reason: string }[] = [];

        for (const { tradeId, status: targetStatus, reason } of updates) {
          // Guardrail: require an explicit reason for sensitive target statuses.
          if (REASON_REQUIRED_TARGETS.has(targetStatus) && (!reason || reason.trim().length === 0)) {
            failed.push({
              tradeId,
              reason: `A reason is required when setting status to ${targetStatus}`,
            });
            continue;
          }

          const trade = await prisma.trade.findFirst({
            where: {
              OR: [
                { tradeId },
                {
                  id: Number.isInteger(Number(tradeId)) ? Number(tradeId) : -1,
                },
              ],
            },
            select: { tradeId: true, status: true, version: true },
          });

          if (!trade) {
            failed.push({ tradeId, reason: "Trade not found" });
            continue;
          }

          if (!isValidTransition(trade.status, targetStatus)) {
            failed.push({
              tradeId,
              reason: `Invalid transition from ${trade.status} to ${targetStatus}`,
            });
            continue;
          }

          // In dry-run mode, stop here — do not persist anything.
          if (dryRun) {
            succeeded.push(trade.tradeId);
            continue;
          }

          const result = await prisma.trade.updateMany({
            where: { tradeId: trade.tradeId, version: trade.version },
            data: { status: targetStatus, version: { increment: 1 } },
          });

          if (result.count === 0) {
            failed.push({
              tradeId,
              reason: "Concurrency conflict: trade was modified",
            });
          } else {
            succeeded.push(trade.tradeId);
          }
        }

        // Admin audit: record which admin performed batch trade status updates.
        // Skip persisting to DB in dry-run mode; still emit a log for visibility.
        const traceCtx = getTraceContext();
        appLogger.info(
          {
            audit: true,
            eventType: "BATCH_TRADE_STATUS_UPDATE",
            actionName: "admin.trades.batch.status",
            dryRun,
            totalUpdates: updates.length,
            succeededCount: succeeded.length,
            failedCount: failed.length,
            succeeded: succeeded,
            failed: failed.map((f) => ({ tradeId: f.tradeId, reason: f.reason })),
            adminAddress: req.user?.walletAddress,
            traceId: traceCtx?.traceId,
            spanId: traceCtx?.spanId,
            timestamp: new Date().toISOString(),
          },
          `[AdminAudit] Batch trade status update${dryRun ? " (dry-run)" : ""}: ${succeeded.length} succeeded, ${failed.length} failed by ${req.user?.walletAddress}`,
        );

        if (!dryRun) {
          await prisma.adminActionAudit.create({
            data: {
              action: "TRADE_BATCH_STATUS_UPDATE",
              actorAddress: req.user!.walletAddress,
              targetReference: `${succeeded.length}/${updates.length} succeeded`,
              note: JSON.stringify({ succeeded, failed }),
            },
          });
        }

        res.status(200).json({ succeeded, failed, dryRun });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
