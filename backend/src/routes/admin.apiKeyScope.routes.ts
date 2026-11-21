/**
 * Admin API Key Scope Simulator routes (#476)
 *
 * POST /api/admin/api-keys/simulate
 *   Dry-run: report whether a key with the given scopes can perform an action.
 *
 * POST /api/admin/api-keys/simulate/batch
 *   Dry-run: check multiple actions in one request.
 *
 * GET  /api/admin/api-keys/actions
 *   List every known platform action (useful for discovery / UI dropdowns).
 */

import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { apiKeyScopeService } from "../services/apiKeyScope.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

// ─── Validation schemas ───────────────────────────────────────────────────────

const scopeItemSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z-]+:[a-z*-]+$/, "Scope must follow resource:verb format, e.g. 'trades:read'");

const simulateBodySchema = z.object({
  /** Scopes assigned to the key under test. */
  scopes: z.array(scopeItemSchema).min(1).max(50),
  /** The action to check, e.g. "trades:write". */
  action: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z-]+:[a-z*-]+$/, "Action must follow resource:verb format"),
  /** Optional free-form context forwarded verbatim in the response. */
  context: z.record(z.unknown()).optional(),
});

const simulateBatchBodySchema = z.object({
  scopes: z.array(scopeItemSchema).min(1).max(50),
  actions: z
    .array(
      z
        .string()
        .min(3)
        .max(64)
        .regex(/^[a-z-]+:[a-z*-]+$/, "Action must follow resource:verb format"),
    )
    .min(1)
    .max(20),
  context: z.record(z.unknown()).optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export function createAdminApiKeyScopeRouter(): Router {
  const router = Router();

  /**
   * POST /api/admin/api-keys/simulate
   *
   * Dry-run a single action against a set of scopes.  Returns a verdict of
   * "allowed" or "denied" with the matched scopes and, on denial, a reason.
   * Does not persist anything.
   *
   * Example request body:
   *   { "scopes": ["trades:read", "evidence:upload"], "action": "trades:write" }
   *
   * Example allowed response:
   *   { "action": "trades:write", "verdict": "denied", "matchedScopes": [], "deniedReason": "...", "dryRun": true }
   */
  router.post(
    "/api/admin/api-keys/simulate",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ body: simulateBodySchema }),
    (req: AuthRequest, res: Response) => {
      const { scopes, action, context } = req.body as z.infer<typeof simulateBodySchema>;
      const result = apiKeyScopeService.simulate({ scopes, action, context });
      res.status(200).json(result);
    },
  );

  /**
   * POST /api/admin/api-keys/simulate/batch
   *
   * Dry-run multiple actions in a single request.  Returns one result per
   * action in the same order as the input.
   *
   * Example request body:
   *   { "scopes": ["trades:read"], "actions": ["trades:read", "trades:write"] }
   */
  router.post(
    "/api/admin/api-keys/simulate/batch",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ body: simulateBatchBodySchema }),
    (req: AuthRequest, res: Response) => {
      const { scopes, actions, context } = req.body as z.infer<typeof simulateBatchBodySchema>;
      const results = apiKeyScopeService.simulateBatch(scopes, actions, context);
      res.status(200).json({ results, count: results.length, dryRun: true });
    },
  );

  /**
   * GET /api/admin/api-keys/actions
   *
   * List every known platform action.  Intended for UI dropdowns and discovery
   * so operators don't need to guess action names.
   */
  router.get(
    "/api/admin/api-keys/actions",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    (_req: AuthRequest, res: Response) => {
      const actions = apiKeyScopeService.listKnownActions();
      res.status(200).json({ actions, count: actions.length });
    },
  );

  return router;
}
