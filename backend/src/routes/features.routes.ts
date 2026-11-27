import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { featureFlagService } from "../services/feature-flags.service";

/**
 * Flags that signed-in clients may read (#269). Admin-only flags stay behind
 * `/api/admin/features`; anything not listed here returns 404 so this route
 * cannot be used to enumerate internal flags.
 */
export const CLIENT_READABLE_FLAGS = new Set<string>(["high_value_trade_reauth"]);

const nameParamSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
});

export function createFeaturesRouter() {
  const router = Router();

  /**
   * GET /features/:name — resolve a client-readable flag for the caller.
   * Returns `enabled` (after rollout bucketing for this wallet) and the
   * flag's optional numeric `value` (e.g. a USDC threshold).
   */
  router.get(
    "/features/:name",
    authMiddleware,
    validateRequest({ params: nameParamSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const name = String(req.params.name);
        if (!CLIENT_READABLE_FLAGS.has(name)) {
          res.status(404).json({ error: "Feature flag not found" });
          return;
        }
        const [flag, enabled] = await Promise.all([
          featureFlagService.getFlag(name),
          featureFlagService.isEnabled(name, req.user?.walletAddress),
        ]);
        res.status(200).json({ name, enabled, value: flag?.value ?? null });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
