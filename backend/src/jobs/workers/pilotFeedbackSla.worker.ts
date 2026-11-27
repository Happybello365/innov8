import { Worker, Job } from "bullmq";
import { appLogger } from "../../middleware/logger";
import { createQueueConnection } from "../queue";
import { pilotFeedbackSlaService } from "../../services/pilotFeedbackSla.service";
import { attachDeadLetterQueue } from "../deadLetter";

export interface PilotFeedbackSLACheckJobData {
  batchSize?: number;
}

/**
 * Scheduled job worker that checks for pilot feedback items exceeding their SLA.
 * Dispatches alerts for items that have been open longer than the configured SLA
 * without a resolution note. Ensures exactly one alert per violation via
 * slaViolationAlertSentAt tracking.
 */
export async function processPilotFeedbackSLACheck(
  job: Job<PilotFeedbackSLACheckJobData>,
) {
  appLogger.info({ jobId: job.id }, "Pilot feedback SLA check started");
  const startedAt = Date.now();

  try {
    const result = await pilotFeedbackSlaService.checkSLAViolations();

    const durationMs = Date.now() - startedAt;

    appLogger.info(
      { jobId: job.id, ...result, durationMs },
      "Pilot feedback SLA check completed",
    );

    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;

    appLogger.error(
      { jobId: job.id, error: err, durationMs },
      "Pilot feedback SLA check failed",
    );

    throw err;
  }
}

export function createPilotFeedbackSLAWorker(): Worker<PilotFeedbackSLACheckJobData> {
  const worker = new Worker<PilotFeedbackSLACheckJobData>(
    "pilot-feedback-sla-check",
    processPilotFeedbackSLACheck,
    { connection: createQueueConnection() },
  );
  attachDeadLetterQueue(worker, "pilot-feedback-sla-check");
  return worker;
}
