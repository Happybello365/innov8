import { Response, Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { validateRequest } from '../middleware/validateRequest';
import { AuthRequest } from '../services/auth.service';
import { TradeExpiryService, tradeExpiryService } from '../services/tradeExpiry.service';
import { tradeExpiryQueue } from '../jobs/queue';
import { appLogger } from '../middleware/logger';

const sweepBodySchema = z.object({
  batchSize: z.number().int().min(1).max(500).default(100),
});

export function createAdminExpiryRouter(
  expiryService: TradeExpiryService = tradeExpiryService,
): Router {
  const router = Router();

  router.use(authMiddleware, adminMiddleware);

  /**
   * POST /api/admin/trades/sweep-expired/preview
   *
   * Dry-run of the expiry sweep. Returns the exact set of trades that the
   * next `sweep-expired` call with the same `batchSize` would expire, without
   * writing anything to the database. The admin confirmation flow should call
   * this first so the operator can see affected trade IDs, amounts, and which
   * trades require an on-chain escrow refund before confirming the sweep.
   *
   * Returns:
   *   - `trades` — ordered by `expiresAt` asc, same ordering as the real sweep
   *   - `wouldExpire` — total count
   *   - `wouldRefund` — count of FUNDED trades that need an escrow refund
   *   - `preview: true` — sentinel so callers can distinguish from live responses
   */
  router.post(
    '/api/admin/trades/sweep-expired/preview',
    validateRequest({ body: sweepBodySchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { batchSize } = sweepBodySchema.parse(req.body);
        const result = await expiryService.previewSweep(batchSize);
        appLogger.info(
          {
            actorAddress: req.user?.walletAddress,
            wouldExpire: result.wouldExpire,
            wouldRefund: result.wouldRefund,
            batchSize,
          },
          'Admin previewed expiry sweep',
        );
        res.json(result);
      } catch (err) {
        appLogger.error({ err }, 'Admin expiry sweep preview failed');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  /**
   * POST /api/admin/trades/sweep-expired
   * Trigger an immediate expiry sweep (admin override for stuck expiries).
   */
  router.post(
    '/api/admin/trades/sweep-expired',
    validateRequest({ body: sweepBodySchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { batchSize } = sweepBodySchema.parse(req.body);
        const result = await expiryService.sweepExpiredTrades(batchSize);
        appLogger.info({ actorAddress: req.user?.walletAddress, ...result }, 'Admin triggered expiry sweep');
        res.json(result);
      } catch (err) {
        appLogger.error({ err }, 'Admin expiry sweep failed');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  /**
   * POST /api/admin/trades/sweep-expired/enqueue
   * Enqueue an expiry sweep job to run asynchronously.
   */
  router.post(
    '/api/admin/trades/sweep-expired/enqueue',
    validateRequest({ body: sweepBodySchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { batchSize } = sweepBodySchema.parse(req.body);
        const job = await tradeExpiryQueue.add('admin-sweep', { batchSize });
        res.json({ jobId: job.id, batchSize });
      } catch (err) {
        appLogger.error({ err }, 'Failed to enqueue expiry sweep');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  /**
   * GET /api/admin/trades/pending-refunds
   * Lists EXPIRED trades awaiting on-chain refund submission.
   */
  router.get(
    '/api/admin/trades/pending-refunds',
    async (_req: AuthRequest, res: Response) => {
      try {
        const pending = await expiryService.getPendingRefunds();
        res.json({ count: pending.length, trades: pending });
      } catch (err) {
        appLogger.error({ err }, 'Failed to fetch pending refunds');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  return router;
}
