/**
 * BullMQ worker for account deletion data export (issue #458).
 *
 * Before account deletion is finalized the system enqueues an
 * `account-deletion-export` job. This worker generates a full snapshot of
 * user-owned data and caches it in Redis for 72 hours so an admin or
 * downstream deletion job can verify the export before irreversibly removing
 * the account.
 *
 * On success the worker returns the export summary (record counts per entity).
 * On failure the job is retried per the BullMQ default policy; a dead-letter
 * handler is attached so persistent failures are observable.
 */

import { Worker, Job } from "bullmq";
import { appLogger } from "../../middleware/logger";
import { createQueueConnection } from "../queue";
import { accountDeletionExportService } from "../../services/accountDeletionExport.service";
import { attachDeadLetterQueue } from "../deadLetter";

export interface AccountDeletionExportJobData {
  /** Normalised (lowercase) wallet address of the account being deleted. */
  walletAddress: string;
  /** Optional: who requested the deletion (admin walletAddress or "self"). */
  requestedBy?: string;
}

export interface AccountDeletionExportJobResult {
  walletAddress: string;
  exportedAt: string;
  tradeBuyerCount: number;
  tradeSellerCount: number;
  disputeCount: number;
  notificationCount: number;
}

export async function processAccountDeletionExport(
  job: Job<AccountDeletionExportJobData>,
): Promise<AccountDeletionExportJobResult> {
  const { walletAddress, requestedBy = "system" } = job.data;

  appLogger.info(
    { jobId: job.id, walletAddress, requestedBy },
    "Account deletion export job started",
  );

  const startedAt = Date.now();
  const snapshot = await accountDeletionExportService.generateDeletionExport(walletAddress);
  const durationMs = Date.now() - startedAt;

  const result: AccountDeletionExportJobResult = {
    walletAddress,
    exportedAt: snapshot.exportedAt,
    tradeBuyerCount: (snapshot.trades.buyer as unknown[]).length,
    tradeSellerCount: (snapshot.trades.seller as unknown[]).length,
    disputeCount: (snapshot.disputes as unknown[]).length,
    notificationCount: (snapshot.notifications as unknown[]).length,
  };

  appLogger.info(
    { jobId: job.id, ...result, durationMs },
    "Account deletion export job completed",
  );

  return result;
}

export function createAccountDeletionExportWorker(): Worker<AccountDeletionExportJobData> {
  const worker = new Worker<AccountDeletionExportJobData>(
    "account-deletion-export",
    processAccountDeletionExport,
    { connection: createQueueConnection() },
  );
  attachDeadLetterQueue(worker, "account-deletion-export");
  return worker;
}
