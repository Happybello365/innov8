/**
 * Trade archive lifecycle routes (#454).
 *
 * POST /trades/:id/archive   — archive a closed trade
 * POST /trades/:id/restore   — restore an archived trade
 * GET  /trades/archived      — list the caller's archived trades
 */

import { Router, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthRequest } from "../services/auth.service";
import { TradeArchiveService } from "../services/trade.archive.service";
import { prisma as defaultPrisma } from "../lib/db";
import { validateRequest } from "../middleware/validateRequest";

const tradeIdParamSchema = z.object({
  id: z.string().trim().min(1).max(255),
});

const listArchivedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function createTradeArchiveRouter(prisma: PrismaClient = defaultPrisma): Router {
  const router = Router();
  const archiveService = new TradeArchiveService(prisma);

  const requireWallet = (req: AuthRequest, res: Response): string | null => {
    const addr = req.user?.walletAddress?.trim();
    if (!addr) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return addr;
  };

  // GET /trades/archived — list the caller's archived trades.
  // Must be registered before /:id so it isn't shadowed.
  router.get(
    "/archived",
    authMiddleware,
    validateRequest({ query: listArchivedQuerySchema }),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      const caller = requireWallet(req, res);
      if (!caller) return;
      try {
        const { page, limit } = req.query as any;
        const result = await archiveService.listArchivedTrades(caller, page, limit);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /trades/:id/archive
  router.post(
    "/:id/archive",
    authMiddleware,
    validateRequest({ params: tradeIdParamSchema }),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      const caller = requireWallet(req, res);
      if (!caller) return;
      try {
        const trade = await archiveService.archiveTrade(req.params.id as string, caller);
        res.status(200).json({ ok: true, tradeId: trade.tradeId, archivedAt: trade.archivedAt });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /trades/:id/restore
  router.post(
    "/:id/restore",
    authMiddleware,
    validateRequest({ params: tradeIdParamSchema }),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      const caller = requireWallet(req, res);
      if (!caller) return;
      try {
        const trade = await archiveService.restoreTrade(req.params.id as string, caller);
        res.status(200).json({ ok: true, tradeId: trade.tradeId, archivedAt: trade.archivedAt });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
