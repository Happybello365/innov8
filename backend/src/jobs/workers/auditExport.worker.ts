/**
 * AuditExport worker — drives AuditExport rows through QUEUED → GENERATING → READY.
 *
 * On unrecoverable failure (after BullMQ exhausts retries) it marks the row
 * EXPIRED so the status endpoint surfaces a useful error rather than a stale QUEUED.
 */

import { Worker, Job } from 'bullmq';
import { Parser as CsvParser } from 'json2csv';
import { appLogger } from '../../middleware/logger';
import { createQueueConnection, AuditExportJobData } from '../queue';
import { prisma } from '../../lib/db';
import { AuditExportService } from '../../services/auditExport.service';
import { attachDeadLetterQueue } from '../deadLetter';

const CSV_FIELDS = [
  'id',
  'action',
  'actorAddress',
  'targetReference',
  'note',
  'createdAt',
];

async function uploadToS3(data: string, key: string): Promise<string | undefined> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return undefined;
  appLogger.warn({ key, bucket }, 'S3 upload skipped — install @aws-sdk/client-s3 to enable');
  return undefined;
}

export function createAuditExportWorker(
  exportService: AuditExportService = new AuditExportService(),
): Worker<AuditExportJobData> {
  const worker = new Worker<AuditExportJobData>(
    'audit-exports',
    async (job: Job<AuditExportJobData>): Promise<void> => {
      const { exportId, requestedBy, format } = job.data;
      appLogger.info({ jobId: job.id, exportId, requestedBy }, 'Processing audit export job');

      // Transition: QUEUED → GENERATING
      await exportService.markGenerating(exportId);

      // Fetch all AdminActionAudit rows (no pagination — exports are bounded by
      // admin volume; large exports should be gated upstream if needed)
      const rows = await prisma.adminActionAudit.findMany({
        orderBy: { createdAt: 'desc' },
      });

      let data: string;
      if (format === 'csv') {
        const parser = new CsvParser({ fields: CSV_FIELDS });
        data = rows.length > 0 ? parser.parse(rows as any[]) : '';
      } else {
        data = JSON.stringify(rows, null, 2);
      }

      const s3Key = `audit-exports/${requestedBy}/${job.id}.${format}`;
      const s3Uri = await uploadToS3(data, s3Key);

      // Transition: GENERATING → READY
      await exportService.markReady(exportId, {
        rowCount: rows.length,
        // Only store inline data when S3 is not configured
        data: s3Uri ? undefined : data,
        s3Key: s3Uri,
      });

      appLogger.info({ jobId: job.id, exportId, rowCount: rows.length }, 'Audit export job completed');
    },
    { connection: createQueueConnection() },
  );

  // On terminal failure, surface the error through the status row so callers
  // polling the status endpoint get a meaningful message.
  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { exportId } = job.data;
    try {
      await exportService.markFailed(exportId, err.message ?? 'Export job failed');
    } catch (innerErr) {
      appLogger.error({ err: innerErr, exportId }, 'Failed to mark audit export as failed');
    }
  });

  attachDeadLetterQueue(worker, 'audit-exports');
  return worker;
}
