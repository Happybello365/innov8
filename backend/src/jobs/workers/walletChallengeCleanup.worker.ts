/**
 * BullMQ worker for wallet ownership challenge cleanup (issue #456).
 *
 * Scheduled nightly (or on-demand) to scan Redis for stale `challenge:*` keys
 * that either have no TTL or have already expired but not yet been evicted,
 * and remove them. The job is idempotent: running it multiple times has no
 * additional effect beyond the first successful sweep.
 */

import { Worker, Job } from "bullmq";
import { appLogger } from "../../middleware/logger";
import { createQueueConnection } from "../queue";
import { walletChallengeCleanupService } from "../../services/walletChallengeCleanup.service";
import { attachDeadLetterQueue } from "../deadLetter";

export interface WalletChallengeCleanupJobData {
  triggeredBy?: string;
}

export async function processWalletChallengeCleanup(
  job: Job<WalletChallengeCleanupJobData>,
): Promise<{ scanned: number; deleted: number; errors: number }> {
  const { triggeredBy = "scheduler" } = job.data ?? {};
  appLogger.info(
    { jobId: job.id, triggeredBy },
    "Wallet challenge cleanup job started",
  );

  const startedAt = Date.now();
  const result = await walletChallengeCleanupService.cleanupStaleChallenges();
  const durationMs = Date.now() - startedAt;

  appLogger.info(
    { jobId: job.id, ...result, durationMs },
    "Wallet challenge cleanup job completed",
  );

  return result;
}

export function createWalletChallengeCleanupWorker(): Worker<WalletChallengeCleanupJobData> {
  const worker = new Worker<WalletChallengeCleanupJobData>(
    "wallet-challenge-cleanup",
    processWalletChallengeCleanup,
    { connection: createQueueConnection() },
  );
  attachDeadLetterQueue(worker, "wallet-challenge-cleanup");
  return worker;
}
