import { Worker, Job } from 'bullmq';
import { appLogger } from '../../middleware/logger';
import { createQueueConnection, NotificationJobData, notificationQueue } from '../queue';
import { prisma } from '../../lib/db';
import type { Prisma } from '@prisma/client';
import { attachDeadLetterQueue } from '../deadLetter';
import {
  isInQuietHours,
  CRITICAL_NOTIFICATION_TYPES,
  StoredPreferenceBlob,
  QuietHoursPreference,
} from '../../routes/notifications.preferences.routes';

/**
 * Compute the millisecond delay until quiet hours end.
 * Used to re-schedule deferred notifications.
 */
function msUntilQuietHoursEnd(quietHours: QuietHoursPreference): number {
  const now = new Date();
  const [endHh, endMm] = quietHours.quietHoursEnd.split(':').map(Number);

  // Build a candidate "end time" in the user's timezone for today
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: quietHours.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = formatter.format(now); // YYYY-MM-DD
  const candidate = new Date(`${localDateStr}T${String(endHh).padStart(2, '0')}:${String(endMm).padStart(2, '0')}:00`);

  // Convert local midnight to UTC by subtracting timezone offset
  const tzOffsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: quietHours.timezone })).getTime();
  const candidateUtc = new Date(candidate.getTime() + tzOffsetMs);

  const delayMs = candidateUtc.getTime() - now.getTime();
  // If the end time has already passed today, schedule for tomorrow
  return delayMs > 0 ? delayMs : delayMs + 24 * 60 * 60 * 1000;
}

export function createNotificationWorker(): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    'notifications',
    async (job: Job<NotificationJobData>) => {
      const { userAddress, type, title, message, metadata } = job.data;
      appLogger.info({ jobId: job.id, userAddress, type }, 'Processing notification job');

      // --- Quiet hours check ---
      // Critical notifications always bypass quiet hours.
      const notificationEventType: string = (metadata?.eventType as string) ?? type;
      const isCritical = CRITICAL_NOTIFICATION_TYPES.has(notificationEventType);

      if (!isCritical) {
        try {
          const prefRecord = await (prisma as any).notificationPreference?.findUnique({
            where: { userAddress },
          }) as { preferences: unknown } | null | undefined;

          if (prefRecord?.preferences) {
            const blob = prefRecord.preferences as StoredPreferenceBlob;
            if (blob.quietHours && isInQuietHours(blob.quietHours)) {
              const delay = msUntilQuietHoursEnd(blob.quietHours);
              appLogger.info(
                { jobId: job.id, userAddress, delayMs: delay },
                'Deferring non-critical notification until quiet hours end',
              );
              await notificationQueue.add('notification', job.data, { delay });
              return; // original job is done; re-queued version will process later
            }
          }
        } catch (prefErr) {
          // Non-fatal: if we cannot read prefs, deliver normally
          appLogger.warn({ jobId: job.id, err: prefErr }, 'Failed to read notification preferences; delivering immediately');
        }
      }
      // --- End quiet hours check ---

      if (type === 'in_app') {
        await prisma.inAppNotification.create({
          data: {
            userAddress,
            title,
            message,
            type,
            metadata: (metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      } else {
        // email / push: log intent; extend with provider integration
        appLogger.info({ jobId: job.id, type, userAddress }, `${type} notification dispatched`);
      }

      appLogger.info({ jobId: job.id, userAddress }, 'Notification job completed');
    },
    { connection: createQueueConnection() },
  );
  attachDeadLetterQueue(worker, 'notifications');
  return worker;
}
