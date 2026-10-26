import { Router } from "express";
import { prisma } from "../lib/db";
import { ReputationService } from "../services/reputation.service";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { AppError, ErrorCode } from "../errors/errorCodes";

const router = Router();
const reputationService = new ReputationService(prisma);

router.get(
  "/me/reputation",
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const address = req.user?.walletAddress;
      if (!address) {
        return next(new AppError(ErrorCode.AUTH_ERROR, "Unauthorized", 401));
      }
      const reputation = await reputationService.getUserReputation(address);
      res.json(reputation);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:address/reputation",
  async (req, res, next) => {
    try {
      const raw = req.params.address;
      const address = Array.isArray(raw) ? raw[0] : raw;
      if (!address) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, "Wallet address is required", 400));
      }
      const reputation = await reputationService.getUserReputation(address);
      res.json(reputation);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /reputation/:address/history
 *
 * Returns a cursor-paginated list of trust-score snapshots for the given wallet.
 *
 * Query params:
 *   from    – ISO date string; include snapshots on or after this date
 *   to      – ISO date string; include snapshots on or before this date
 *   cursor  – last seen snapshot id (for keyset pagination)
 *   limit   – page size (1–100, default 20)
 */
router.get(
  "/:address/history",
  async (req, res, next) => {
    try {
      const raw = req.params.address;
      const address = Array.isArray(raw) ? raw[0] : raw;
      if (!address) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, "Wallet address is required", 400));
      }

      const { from, to, cursor, limit } = req.query as Record<string, string | undefined>;
      const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;
      const parsedLimit = limit ? parseInt(limit, 10) : 20;

      if (cursor && (isNaN(parsedCursor!) || parsedCursor! <= 0)) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, "cursor must be a positive integer", 400));
      }
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, "limit must be a positive integer (max 100)", 400));
      }

      const page = await reputationService.getReputationHistory(
        address,
        from,
        to,
        parsedCursor,
        parsedLimit,
      );
      res.json(page);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
