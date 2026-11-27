import { Response, Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../services/auth.service';
import { appLogger } from '../middleware/logger';
import {
  reconciliationQueue,
  treasuryReconciliationQueue,
  piiScanQueue,
  webhookSecretPurgeQueue,
  pilotFeedbackSlaCheckQueue,
} from '../jobs/queue';

/** Minimal queue surface needed for pause controls (BullMQ `Queue` satisfies it). */
export interface PausableQueue {
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): Promise<boolean>;
}

/**
 * Operationally risky scheduled jobs that admins may pause/resume.
 * Pausing a BullMQ queue stops workers from picking up new jobs globally
 * (across all processes); in-flight jobs finish normally and repeatable
 * schedules keep enqueuing so nothing is lost when resumed.
 */
export const DEFAULT_PAUSABLE_JOBS: Record<string, PausableQueue> = {
  reconciliation: reconciliationQueue,
  'treasury-reconciliation': treasuryReconciliationQueue,
  'pii-log-scan': piiScanQueue,
  'webhook-secret-purge': webhookSecretPurgeQueue,
  'pilot-feedback-sla-check': pilotFeedbackSlaCheckQueue,
};

export function createAdminJobsRouter(
  registry: Record<string, PausableQueue> = DEFAULT_PAUSABLE_JOBS,
): Router {
  const router = Router();
  router.use('/api/admin/jobs', authMiddleware, adminMiddleware);

  const resolve = (req: AuthRequest, res: Response): PausableQueue | undefined => {
    const { job } = req.params as { job: string };
    const queue = Object.prototype.hasOwnProperty.call(registry, job) ? registry[job] : undefined;
    if (!queue) res.status(404).json({ error: 'Unknown job' });
    return queue;
  };

  /** GET /api/admin/jobs — pause status of every controllable job */
  router.get('/api/admin/jobs', async (_req: AuthRequest, res: Response) => {
    try {
      const jobs = await Promise.all(
        Object.entries(registry).map(async ([name, q]) => ({ job: name, paused: await q.isPaused() })),
      );
      res.json({ jobs });
    } catch (err) {
      appLogger.error({ err }, 'Failed to read job pause status');
      res.status(503).json({ error: 'Job queue unavailable' });
    }
  });

  /** GET /api/admin/jobs/:job/status */
  router.get('/api/admin/jobs/:job/status', async (req: AuthRequest, res: Response) => {
    const queue = resolve(req, res);
    if (!queue) return;
    try {
      res.json({ job: req.params.job, paused: await queue.isPaused() });
    } catch (err) {
      appLogger.error({ err, job: req.params.job }, 'Failed to read job pause status');
      res.status(503).json({ error: 'Job queue unavailable' });
    }
  });

  for (const action of ['pause', 'resume'] as const) {
    /** POST /api/admin/jobs/:job/pause | /api/admin/jobs/:job/resume */
    router.post(`/api/admin/jobs/:job/${action}`, async (req: AuthRequest, res: Response) => {
      const queue = resolve(req, res);
      if (!queue) return;
      const job = req.params.job;
      try {
        await queue[action]();
        const paused = action === 'pause';
        appLogger.warn(
          { job, action, admin: req.user?.walletAddress, correlationId: (req as { correlationId?: string }).correlationId },
          `Scheduled job ${paused ? 'paused' : 'resumed'} by admin`,
        );
        res.json({ job, paused });
      } catch (err) {
        appLogger.error({ err, job, action }, 'Failed to change job pause state');
        res.status(503).json({ error: 'Job queue unavailable' });
      }
    });
  }

  return router;
}
