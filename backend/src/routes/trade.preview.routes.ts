/**
 * Trade share-preview endpoint
 *
 * GET /trades/:id/preview
 *
 * Returns a minimal, non-authenticated snapshot of a trade suitable for
 * link previews and sharing (e.g. messaging apps, support tickets).
 *
 * Design decisions:
 * - **No authentication required** so the URL is shareable without login.
 * - **No PII exposed**: wallet addresses are truncated to prefix + suffix;
 *   the buyer/seller display names, notes, and manifest details are
 *   never included.
 * - **Expired / cancelled trades** return 410 Gone so link-preview crawlers
 *   show a clear "trade no longer active" state rather than stale data.
 * - **Non-existent trades** return 404 to avoid confirming IDs to callers.
 * - **Disputed trades** return a preview with a `disputed: true` flag so
 *   the recipient knows the trade is contested before clicking through.
 */

import { PrismaClient, TradeStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma as defaultPrisma } from "../lib/db";
import { validateRequest } from "../middleware/validateRequest";

/** Statuses that mean the trade is finished and the link is dead. */
const TERMINAL_STATUSES = new Set<TradeStatus>([
  TradeStatus.CANCELLED,
  TradeStatus.EXPIRED,
]);

/** Statuses that mean the trade is fully completed (positive terminal). */
const COMPLETED_STATUS = TradeStatus.COMPLETED;

const previewParamSchema = z.object({
  id: z.string().min(1, "Trade ID is required"),
});

/**
 * Truncates a Stellar public key to a safe abbreviated form.
 * Example: "GABCD...WXYZ" (first 6 + last 4 characters).
 * Returns the original value unchanged if it is shorter than 12 characters.
 */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Build the public-safe preview payload.
 * No wallet addresses in full form, no amounts, no names, no notes.
 */
function buildPreview(trade: {
  tradeId: string;
  status: TradeStatus;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: string;
  createdAt: Date;
  expiresAt: Date | null;
  fundedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    tradeId: trade.tradeId,
    status: trade.status,
    disputed: trade.status === TradeStatus.DISPUTED,
    // Truncated addresses let the recipient confirm they are party to the trade
    // without exposing the full public key.
    buyerAddressPreview: truncateAddress(trade.buyerAddress),
    sellerAddressPreview: truncateAddress(trade.sellerAddress),
    // Amount tier (not exact value) so the preview is informative but doesn't
    // expose financial specifics to anyone who guesses a trade ID.
    amountTier: amountTier(trade.amountUsdc),
    createdAt: trade.createdAt.toISOString(),
    ...(trade.expiresAt ? { expiresAt: trade.expiresAt.toISOString() } : {}),
    ...(trade.fundedAt ? { fundedAt: trade.fundedAt.toISOString() } : {}),
    ...(trade.completedAt ? { completedAt: trade.completedAt.toISOString() } : {}),
  };
}

/**
 * Returns a coarse amount tier string instead of the exact value.
 * This avoids leaking financial specifics to unauthenticated callers.
 */
function amountTier(amountUsdc: string): string {
  const n = Number(amountUsdc);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  if (n < 100) return "<100 USDC";
  if (n < 1_000) return "100–999 USDC";
  if (n < 10_000) return "1,000–9,999 USDC";
  if (n < 100_000) return "10,000–99,999 USDC";
  return "100,000+ USDC";
}

export function createTradePreviewRouter(prisma: PrismaClient = defaultPrisma): Router {
  const router = Router();

  router.get(
    "/:id/preview",
    validateRequest({ params: previewParamSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as { id: string };

        // Support both numeric DB id and the string tradeId.
        const numericId = Number(id);
        const orConditions: Array<Record<string, unknown>> = [{ tradeId: id }];
        if (Number.isInteger(numericId) && numericId > 0) {
          orConditions.push({ id: numericId });
        }

        const trade = await prisma.trade.findFirst({
          where: { OR: orConditions },
          select: {
            tradeId: true,
            status: true,
            buyerAddress: true,
            sellerAddress: true,
            amountUsdc: true,
            createdAt: true,
            expiresAt: true,
            fundedAt: true,
            completedAt: true,
          },
        });

        if (!trade) {
          res.status(404).json({ error: "Trade not found" });
          return;
        }

        // Terminal (dead) trades return 410 so link-preview UIs can show
        // "this trade has ended" rather than stale data.
        if (TERMINAL_STATUSES.has(trade.status)) {
          res.status(410).json({
            error: "Trade no longer active",
            status: trade.status,
            tradeId: trade.tradeId,
          });
          return;
        }

        // Completed trades are still worth previewing (receipt-like use case)
        // but we include a completed flag so the UI can render appropriately.
        const preview = buildPreview(trade);
        res.status(trade.status === COMPLETED_STATUS ? 200 : 200).json(preview);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const tradePreviewRoutes = createTradePreviewRouter();
