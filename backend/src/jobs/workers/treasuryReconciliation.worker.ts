/**
 * BullMQ worker for nightly treasury reconciliation (#209).
 *
 * Runs the escrow contract balance vs. DB diff check and raises alerts when
 * drift is detected (see treasuryReconciliation.service.ts).
 */

import { Worker, Job } from "bullmq";
import { appLogger } from "../../middleware/logger";
import { createQueueConnection } from "../queue";
import { treasuryReconciliationService } from "../../services/treasuryReconciliation.service";
import { attachDeadLetterQueue } from "../deadLetter";

export interface TreasuryReconciliationJobData {
  triggeredBy?: string;
}

export function createTreasuryReconciliationWorker(): Worker<TreasuryReconciliationJobData> {
  const worker = new Worker<TreasuryReconciliationJobData>(
    "treasury-reconciliation",
    async (job: Job<TreasuryReconciliationJobData>) => {
      appLogger.info({ jobId: job.id }, "Treasury reconciliation job started");
      try {
        const report = await treasuryReconciliationService.run();
        appLogger.info(
          { jobId: job.id, reportId: report.reportId, severity: report.severity },
          "Treasury reconciliation job completed",
        );
        return report;
      } catch (error) {
        appLogger.error({ jobId: job.id, error }, "Treasury reconciliation job failed");
        throw error;
      }
    },
    { connection: createQueueConnection() },
  );
  attachDeadLetterQueue(worker, "treasury-reconciliation");
  return worker;
}
