/**
 * Admin routes for wallet ownership challenge cleanup (issue #456).
 *
 * Provides on-demand trigger endpoints so operators can run a cleanup
 * sweep immediately without waiting for the next scheduled run.
 */

import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { walletChallengeCleanupService } from "../services/walletChallengeCleanup.service";
import { walletChallengeCleanupQueue } from "../jobs/queue";
import { appLogger } from "../middleware/logger";

export function createAdminWalletChallengeRouter(): Router {
  const router = Router();

  router.use(authMiddleware, adminMiddleware);

  /**
   * POST /api/admin/wallet-challenges/cleanup
   * Run the stale challenge cleanup synchronously and return metrics.
   */
  router.post(
    "/api/admin/wallet-challenges/cleanup",
    async (req: AuthRequest, res: Response, next) => {
      try {
        const result = await walletChallengeCleanupService.cleanupStaleChallenges();
        appLogger.info(
          { actorAddress: req.user?.walletAddress, ...result },
          "Admin triggered wallet challenge cleanup",
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/admin/wallet-challenges/cleanup/enqueue
   * Enqueue the cleanup as an async BullMQ job.
   */
  router.post(
    "/api/admin/wallet-challenges/cleanup/enqueue",
    async (req: AuthRequest, res: Response, next) => {
      try {
        const job = await walletChallengeCleanupQueue.add("admin-cleanup", {
          triggeredBy: req.user?.walletAddress,
        });
        res.status(202).json({ jobId: job.id, message: "Cleanup job enqueued" });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
