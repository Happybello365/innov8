import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { appLogger } from "../middleware/logger";
import { notificationQueue as defaultQueue } from "../jobs/queue";
import {
  NOTIFICATION_TEMPLATES,
  renderNotificationTemplate,
} from "../lib/notificationTemplates";

const paramsSchema = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/, "Invalid template key") });
const bodySchema = z.object({
  variables: z.record(z.string().max(64), z.union([z.string().max(500), z.number()])).default({}),
});

interface QueueLike {
  add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>;
}

/**
 * Admin-only notification template preview and test-send (#473).
 *
 * - POST /admin/notifications/templates/:key/preview  → renders, never delivers.
 * - POST /admin/notifications/templates/:key/test-send → delivers an in-app copy to the
 *   calling admin only; the recipient cannot be overridden, so real users are never affected.
 */
export function createAdminNotificationTemplatesRouter(queue: QueueLike = defaultQueue) {
  const router = Router();

  const render = (req: AuthRequest, res: Response) => {
    const template = NOTIFICATION_TEMPLATES[req.params.key];
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return null;
    }
    const { variables } = req.body as z.infer<typeof bodySchema>;
    const rendered = renderNotificationTemplate(template, variables ?? {});
    if (rendered.missingVariables.length > 0) {
      res.status(422).json({ error: "Missing template variables", missingVariables: rendered.missingVariables });
      return null;
    }
    return rendered;
  };

  router.get("/admin/notifications/templates", authMiddleware, adminMiddleware, (_req, res) => {
    res.status(200).json({
      templates: Object.values(NOTIFICATION_TEMPLATES).map(({ key, variables }) => ({ key, variables })),
    });
  });

  router.post(
    "/admin/notifications/templates/:key/preview",
    authMiddleware,
    adminMiddleware,
    validateRequest({ params: paramsSchema, body: bodySchema }),
    (req: AuthRequest, res: Response) => {
      const rendered = render(req, res);
      if (!rendered) return;
      res.status(200).json({ preview: rendered, delivered: false });
    },
  );

  router.post(
    "/admin/notifications/templates/:key/test-send",
    authMiddleware,
    adminMiddleware,
    validateRequest({ params: paramsSchema, body: bodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const rendered = render(req, res);
        if (!rendered) return;
        const recipient = req.user!.walletAddress;
        await queue.add("notification", {
          userAddress: recipient,
          type: "in_app",
          title: `[TEST] ${rendered.title}`,
          message: rendered.message,
          metadata: { eventType: `template_test:${rendered.key}`, test: true },
        });
        appLogger.info({ templateKey: rendered.key }, "Notification template test-send queued");
        res.status(202).json({ preview: rendered, delivered: true, recipient: "self" });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
