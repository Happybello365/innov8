import { prisma } from "../lib/db";
import { appLogger } from "../middleware/logger";
import { alertService } from "./alert.service";

/**
 * PilotFeedbackSLAService monitors pilot feedback items for SLA violations.
 *
 * SLA behavior:
 * - Items in OPEN status are checked against the configurable SLA (default: 7 days)
 * - An item is considered "violated" if it has been OPEN longer than the SLA
 * - An alert is dispatched exactly once per violation via slaViolationAlertSentAt tracking
 * - Resolved items never trigger alerts regardless of age
 * - Once an alert has been sent, no duplicate alerts are sent until the item is resolved
 */
export class PilotFeedbackSLAService {
  private readonly slaHours: number;

  constructor(slaHours: number = 7 * 24) {
    // Default: 7 days in hours
    this.slaHours = slaHours;
  }

  /**
   * Scan for open pilot feedback items past SLA and dispatch alerts.
   * Returns count of items alerted.
   */
  async checkSLAViolations(): Promise<{ alerted: number; errors: number }> {
    appLogger.info(
      { slaHours: this.slaHours },
      "Starting pilot feedback SLA check",
    );

    let alerted = 0;
    let errors = 0;

    try {
      // Calculate SLA cutoff: items created before this time are past SLA
      const slaThreshold = new Date(
        Date.now() - this.slaHours * 60 * 60 * 1000,
      );

      appLogger.debug(
        { slaThreshold, slaHours: this.slaHours },
        "SLA threshold calculated",
      );

      // Find items that are:
      // 1. Status = OPEN (not yet resolved)
      // 2. Created before the SLA cutoff
      // 3. Have NOT had an alert sent yet (slaViolationAlertSentAt is null)
      const violatingItems = await prisma.pilotFeedback.findMany({
        where: {
          status: "OPEN",
          createdAt: {
            lt: slaThreshold,
          },
          slaViolationAlertSentAt: null, // Alert not yet sent for this violation
        },
        select: {
          id: true,
          title: true,
          content: true,
          submittedBy: true,
          createdAt: true,
        },
      });

      appLogger.info(
        { count: violatingItems.length },
        "Found pilot feedback items past SLA",
      );

      // For each violating item, send an alert and mark as alerted
      for (const item of violatingItems) {
        try {
          const ageHours = Math.floor(
            (Date.now() - item.createdAt.getTime()) / (60 * 60 * 1000),
          );

          const message = `Pilot feedback item "${item.title}" (ID: ${item.id}) has been open for ${ageHours} hours, exceeding the ${this.slaHours}-hour SLA.`;

          await alertService.dispatch(
            "pilot_feedback_sla_violation",
            message,
            {
              feedbackId: item.id,
              title: item.title,
              submittedBy: item.submittedBy,
              ageHours,
              slaHours: this.slaHours,
            },
          );

          // Mark this item as having had an alert sent
          await prisma.pilotFeedback.update({
            where: { id: item.id },
            data: {
              slaViolationAlertSentAt: new Date(),
            },
          });

          alerted++;

          appLogger.info(
            { feedbackId: item.id, ageHours },
            "SLA violation alert dispatched",
          );
        } catch (err) {
          errors++;
          appLogger.error(
            { feedbackId: item.id, error: err },
            "Failed to process SLA violation",
          );
        }
      }

      appLogger.info(
        { alerted, errors, total: violatingItems.length },
        "Pilot feedback SLA check completed",
      );

      return { alerted, errors };
    } catch (err) {
      appLogger.error(
        { error: err },
        "Pilot feedback SLA check failed",
      );
      throw err;
    }
  }
}

export const pilotFeedbackSlaService = new PilotFeedbackSLAService();
