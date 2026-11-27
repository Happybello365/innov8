import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { eraseUserData, exportUserData } from "../services/privacy.service";
import { accountDeletionExportService } from "../services/accountDeletionExport.service";
import { accountDeletionExportQueue } from "../jobs/queue";

function caller(req: AuthRequest): string | undefined {
  return req.user?.walletAddress;
}

export function createPrivacyRouter() {
  const router = Router();

  router.get("/users/me/export", authMiddleware, async (req: AuthRequest, res: Response, next) => {
    try {
      const address = caller(req);
      if (!address) return res.status(401).json({ error: "Unauthorized" });
      res.json(await exportUserData(address));
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /users/me/deletion-export
   * Returns the cached pre-deletion data snapshot if one exists, otherwise
   * generates one on-demand. Clients should call this before DELETE /users/me
   * to review what data will be removed.
   */
  router.get("/users/me/deletion-export", authMiddleware, async (req: AuthRequest, res: Response, next) => {
    try {
      const address = caller(req);
      if (!address) return res.status(401).json({ error: "Unauthorized" });
      // Return the cached export if available; generate synchronously if not.
      const cached = await accountDeletionExportService.getCachedExport(address);
      if (cached) return res.json(cached);
      const snapshot = await accountDeletionExportService.generateDeletionExport(address);
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /users/me
   * Enqueues an async deletion export job, then proceeds to erase account data.
   * The export is cached in Redis for 72 h so it remains retrievable after deletion
   * for audit purposes even after the DB rows are gone.
   */
  router.delete("/users/me", authMiddleware, async (req: AuthRequest, res: Response, next) => {
    try {
      const address = caller(req);
      if (!address) return res.status(401).json({ error: "Unauthorized" });

      // Generate (or refresh) the pre-deletion export before erasing data.
      await accountDeletionExportService.generateDeletionExport(address);

      const result = await eraseUserData(address);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /admin/privacy/users/:walletAddress/deletion-export
   * Admin: enqueue an async deletion export job for a specific user.
   */
  router.post(
    "/admin/privacy/users/:walletAddress/deletion-export",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { walletAddress } = req.params;
        const job = await accountDeletionExportQueue.add("admin-deletion-export", {
          walletAddress: walletAddress.toLowerCase(),
          requestedBy: caller(req),
        });
        res.status(202).json({
          message: "Deletion export job enqueued",
          jobId: job.id,
          walletAddress: walletAddress.toLowerCase(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/admin/privacy/users/:walletAddress/deletion-export",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { walletAddress } = req.params;
        const cached = await accountDeletionExportService.getCachedExport(walletAddress);
        if (!cached) {
          return res.status(404).json({ error: "No deletion export found for this address. Generate one first." });
        }
        res.json(cached);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/admin/privacy/users/:walletAddress/export", authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      res.json(await exportUserData(req.params.walletAddress as string));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/privacy/users/:walletAddress", authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      res.json(await eraseUserData(req.params.walletAddress as string));
    } catch (error) {
      next(error);
    }
  });

  return router;
}