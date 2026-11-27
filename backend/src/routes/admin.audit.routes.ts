import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { adminAuditService } from "../services/adminAudit.service";
import { AuditExportService, AuditExportNotFoundError, AuditExportAccessDeniedError } from "../services/auditExport.service";
import { auditExportQueue } from "../jobs/queue";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { CURSOR_DEPRECATION_WARNING, InvalidCursorError } from "../lib/cursorPagination";
import { validateRequest } from "../middleware/validateRequest";

function parseNumericQueryParam(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringQueryParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

const exportRequestSchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
});

export function createAdminAuditRouter(
  exportService: AuditExportService = new AuditExportService(),
): Router {
  const router = Router();

  router.get(
    "/api/admin/audit",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const page = parseNumericQueryParam(req.query.page);
        const result = await adminAuditService.list({
          cursor: parseStringQueryParam(req.query.cursor),
          page,
          limit: parseNumericQueryParam(req.query.limit),
        });
        if (page !== undefined) {
          res.setHeader("Warning", CURSOR_DEPRECATION_WARNING);
        }
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.get(
    "/api/admin/audit/verify",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (_req: AuthRequest, res: Response, next) => {
      try {
        const result = await adminAuditService.verifyChain();
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * POST /api/admin/audit/export
   *
   * Enqueue an async export of all AdminActionAudit rows.
   * Returns immediately with the exportId and QUEUED status.
   * Poll GET /api/admin/audit/export/:id to track progress.
   */
  router.post(
    "/api/admin/audit/export",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ body: exportRequestSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { format } = req.body as { format: "csv" | "json" };
        const requestedBy = req.user!.walletAddress;

        const { exportId } = await exportService.create(requestedBy, format);

        // Enqueue the BullMQ job and attach its ID to the export row.
        const job = await auditExportQueue.add("audit-export", {
          exportId,
          requestedBy,
          format,
        });
        await exportService.attachJobId(exportId, job.id!);

        res.status(202).json({
          exportId,
          status: "QUEUED",
          message: `Audit export enqueued. Poll GET /api/admin/audit/export/${exportId} for status.`,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/admin/audit/export/:id
   *
   * Poll the status of an audit export.
   * Returns the current state: QUEUED, GENERATING, READY, or EXPIRED.
   * When READY, includes the export data (or s3Key if S3 is configured).
   */
  router.get(
    "/api/admin/audit/export/:id",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const callerAddress = req.user!.walletAddress;
        const record = await exportService.get(req.params["id"] as string, callerAddress);
        res.status(200).json(record);
      } catch (error) {
        if (error instanceof AuditExportNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof AuditExportAccessDeniedError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
