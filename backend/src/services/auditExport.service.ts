/**
 * AuditExportService — manages the lifecycle of async admin audit exports.
 *
 * State machine:
 *   QUEUED  →  GENERATING  →  READY
 *                           ↘
 *                            EXPIRED  (swept after expiresAt)
 *
 * QUEUED:     Row created; BullMQ job enqueued but not yet started.
 * GENERATING: Worker picked up the job and is building the file.
 * READY:      Export complete; `data` / `s3Key` populated, `rowCount` set.
 * EXPIRED:    TTL elapsed; `data` cleared, `expiredAt` set.
 */

import { PrismaClient, AuditExportStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { randomUUID } from "crypto";
import { appLogger } from "../middleware/logger";

export { AuditExportStatus };

/** Default time-to-live for a READY export (24 hours). */
const DEFAULT_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Sanitised public representation returned by the status endpoint. */
export interface AuditExportRecord {
  exportId: string;
  requestedBy: string;
  format: string;
  status: AuditExportStatus;
  rowCount: number | null;
  /** Inline data payload — only present when status is READY and S3 is not configured. */
  data: string | null;
  /** S3 key — present when status is READY and an S3 upload succeeded. */
  s3Key: string | null;
  readyAt: Date | null;
  expiredAt: Date | null;
  expiresAt: Date;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AuditExportNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Audit export not found");
    this.name = "AuditExportNotFoundError";
  }
}

export class AuditExportAccessDeniedError extends Error {
  status = 403;
  constructor() {
    super("Access denied: you did not request this export");
    this.name = "AuditExportAccessDeniedError";
  }
}

export class AuditExportService {
  private db: Pick<PrismaClient, "auditExport" | "adminActionAudit">;

  constructor(
    db: Pick<PrismaClient, "auditExport" | "adminActionAudit"> = defaultPrisma,
  ) {
    this.db = db;
  }

  /**
   * Create a new export record in QUEUED state and return its exportId.
   * The caller is responsible for enqueuing the BullMQ job immediately after.
   */
  async create(
    requestedBy: string,
    format: "csv" | "json",
    ttlMs: number = DEFAULT_EXPORT_TTL_MS,
  ): Promise<{ exportId: string; rowId: number }> {
    const exportId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const row = await this.db.auditExport.create({
      data: {
        exportId,
        requestedBy,
        format,
        status: AuditExportStatus.QUEUED,
        expiresAt,
      },
    });

    appLogger.info(
      { exportId, requestedBy, format },
      "AuditExport created (QUEUED)",
    );

    return { exportId, rowId: row.id };
  }

  /**
   * Attach the BullMQ job ID once the job is successfully enqueued.
   * No-op if the row is not in QUEUED state (defensive against races).
   */
  async attachJobId(exportId: string, jobId: string): Promise<void> {
    await this.db.auditExport.updateMany({
      where: { exportId, status: AuditExportStatus.QUEUED },
      data: { jobId },
    });
  }

  /** Worker calls this when it starts processing a job (QUEUED → GENERATING). */
  async markGenerating(exportId: string): Promise<void> {
    await this.db.auditExport.updateMany({
      where: { exportId, status: AuditExportStatus.QUEUED },
      data: { status: AuditExportStatus.GENERATING },
    });
    appLogger.info({ exportId }, "AuditExport → GENERATING");
  }

  /** Worker calls this on success (GENERATING → READY). */
  async markReady(
    exportId: string,
    payload: { rowCount: number; data?: string; s3Key?: string },
  ): Promise<void> {
    await this.db.auditExport.updateMany({
      where: { exportId, status: AuditExportStatus.GENERATING },
      data: {
        status: AuditExportStatus.READY,
        rowCount: payload.rowCount,
        data: payload.data ?? null,
        s3Key: payload.s3Key ?? null,
        readyAt: new Date(),
      },
    });
    appLogger.info({ exportId, rowCount: payload.rowCount }, "AuditExport → READY");
  }

  /** Worker calls this on unrecoverable failure (any active state → EXPIRED). */
  async markFailed(exportId: string, errorMessage: string): Promise<void> {
    await this.db.auditExport.updateMany({
      where: {
        exportId,
        status: { in: [AuditExportStatus.QUEUED, AuditExportStatus.GENERATING] },
      },
      data: {
        status: AuditExportStatus.EXPIRED,
        expiredAt: new Date(),
        errorMessage,
      },
    });
    appLogger.warn({ exportId, errorMessage }, "AuditExport → EXPIRED (failed)");
  }

  /**
   * Expire all READY or GENERATING exports whose expiresAt has passed.
   * Returns the number of rows updated.
   */
  async expireStale(): Promise<number> {
    const now = new Date();
    const result = await this.db.auditExport.updateMany({
      where: {
        expiresAt: { lte: now },
        status: { in: [AuditExportStatus.QUEUED, AuditExportStatus.GENERATING, AuditExportStatus.READY] },
      },
      data: {
        status: AuditExportStatus.EXPIRED,
        expiredAt: now,
        // Discard inline data to reclaim storage
        data: null,
      },
    });
    if (result.count > 0) {
      appLogger.info({ count: result.count }, "AuditExport: expired stale exports");
    }
    return result.count;
  }

  /**
   * Retrieve a single export record by exportId.
   * Throws AuditExportNotFoundError when missing.
   * Throws AuditExportAccessDeniedError when the caller is not the requester
   * (pass `callerAddress` as undefined to skip the ownership check, e.g. from a worker).
   */
  async get(exportId: string, callerAddress?: string): Promise<AuditExportRecord> {
    const row = await this.db.auditExport.findUnique({ where: { exportId } });
    if (!row) throw new AuditExportNotFoundError();

    if (
      callerAddress !== undefined &&
      row.requestedBy.toLowerCase() !== callerAddress.toLowerCase()
    ) {
      throw new AuditExportAccessDeniedError();
    }

    return this.toRecord(row);
  }

  private toRecord(row: {
    exportId: string;
    requestedBy: string;
    format: string;
    status: AuditExportStatus;
    rowCount: number | null;
    data: string | null;
    s3Key: string | null;
    readyAt: Date | null;
    expiredAt: Date | null;
    expiresAt: Date;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AuditExportRecord {
    return {
      exportId: row.exportId,
      requestedBy: row.requestedBy,
      format: row.format,
      status: row.status,
      rowCount: row.rowCount,
      // Only surface inline data when the export is ready
      data: row.status === AuditExportStatus.READY ? row.data : null,
      s3Key: row.status === AuditExportStatus.READY ? row.s3Key : null,
      readyAt: row.readyAt,
      expiredAt: row.expiredAt,
      expiresAt: row.expiresAt,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const auditExportService = new AuditExportService();
