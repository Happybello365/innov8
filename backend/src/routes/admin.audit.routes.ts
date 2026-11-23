import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { adminAuditService } from "../services/adminAudit.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { CURSOR_DEPRECATION_WARNING, InvalidCursorError } from "../lib/cursorPagination";
import { queryPiiAccess } from "../lib/piiAudit";

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

export function createAdminAuditRouter(): Router {
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

  // Bounded query over recent PII decrypts (who decrypted what, and why).
  // Returns metadata only; plaintext is never retained.
  router.get(
    "/api/admin/audit/pii-access",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    (req: AuthRequest, res: Response) => {
      const since = parseStringQueryParam(req.query.since);
      if (since !== undefined && Number.isNaN(Date.parse(since))) {
        res.status(400).json({ error: "since must be an ISO-8601 timestamp" });
        return;
      }
      res.status(200).json(
        queryPiiAccess({
          actor: parseStringQueryParam(req.query.actor),
          resource: parseStringQueryParam(req.query.resource),
          recordId: parseStringQueryParam(req.query.recordId),
          action: parseStringQueryParam(req.query.action),
          since,
          limit: parseNumericQueryParam(req.query.limit),
        }),
      );
    },
  );

  return router;
}
