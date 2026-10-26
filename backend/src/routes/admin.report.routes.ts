import { Response, Router } from "express";
import { z } from "zod";
import { TradeStatus, DisputeStatus, StreamStatus } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { adminReportService } from "../services/adminReport.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { randomUUID } from "crypto";

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

// ─── Validation schemas ───────────────────────────────────────────────────

const reportFilterSchema = z.object({
  tradeStatus: z.array(z.nativeEnum(TradeStatus)).optional(),
  disputeStatus: z.array(z.nativeEnum(DisputeStatus)).optional(),
  streamStatus: z.array(z.nativeEnum(StreamStatus)).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  hasDispute: z.boolean().optional(),
  hasStream: z.boolean().optional(),
  buyerAddress: z.string().optional(),
  sellerAddress: z.string().optional(),
});

const savedFilterBodySchema = z.object({
  name: z.string().min(1).max(128),
  filter: reportFilterSchema,
});

function parseFilter(raw: z.infer<typeof reportFilterSchema>) {
  return {
    ...raw,
    createdAfter: raw.createdAfter ? new Date(raw.createdAfter) : undefined,
    createdBefore: raw.createdBefore ? new Date(raw.createdBefore) : undefined,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────

export function createAdminReportRouter(): Router {
  const router = Router();

  /**
   * POST /api/admin/reports/query
   *
   * Run an ad-hoc cross-entity report. Accepts a JSON filter body and returns
   * rows that join trades with their optional disputes and streams.
   */
  router.post(
    "/api/admin/reports/query",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ body: reportFilterSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const filter = parseFilter(req.body as z.infer<typeof reportFilterSchema>);
        const rows = await adminReportService.query(filter);
        res.status(200).json({ rows, count: rows.length });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/admin/reports/saved
   *
   * Save a named filter definition so admins can reuse it later.
   */
  router.post(
    "/api/admin/reports/saved",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ body: savedFilterBodySchema }),
    (req: AuthRequest, res: Response) => {
      const { name, filter } = req.body as z.infer<typeof savedFilterBodySchema>;
      const id = randomUUID();
      const saved = adminReportService.saveFilter(
        id,
        name,
        parseFilter(filter),
        req.user!.walletAddress,
      );
      res.status(201).json(saved);
    },
  );

  /**
   * GET /api/admin/reports/saved
   *
   * List saved filter definitions (scoped to the requesting admin by default).
   */
  router.get(
    "/api/admin/reports/saved",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    (req: AuthRequest, res: Response) => {
      const all = req.query.all === "true";
      const filters = adminReportService.listSavedFilters(
        all ? undefined : req.user!.walletAddress,
      );
      res.status(200).json({ filters });
    },
  );

  /**
   * POST /api/admin/reports/saved/:id/run
   *
   * Execute a previously saved filter and return matching rows.
   */
  router.post(
    "/api/admin/reports/saved/:id/run",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const saved = adminReportService.getSavedFilter(req.params.id);
        if (!saved) {
          res.status(404).json({ error: "Saved filter not found" });
          return;
        }
        const rows = await adminReportService.query(saved.filter);
        res.status(200).json({ filterId: saved.id, filterName: saved.name, rows, count: rows.length });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * DELETE /api/admin/reports/saved/:id
   *
   * Delete a saved filter definition.
   */
  router.delete(
    "/api/admin/reports/saved/:id",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    (req: AuthRequest, res: Response) => {
      const deleted = adminReportService.deleteSavedFilter(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: "Saved filter not found" });
        return;
      }
      res.status(200).json({ deleted: true });
    },
  );

  return router;
}
