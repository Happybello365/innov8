-- CreateEnum
CREATE TYPE "AuditExportStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'EXPIRED');

-- CreateTable
-- AuditExport tracks an asynchronous admin audit-log export request.
-- An admin POSTs to create one (status = QUEUED), the BullMQ worker drives
-- it through GENERATING → READY, and a background sweep marks it EXPIRED
-- after the configured TTL (default 24 hours).
CREATE TABLE "AuditExport" (
    "id"          SERIAL              NOT NULL,
    "exportId"    VARCHAR(255)        NOT NULL,
    "requestedBy" VARCHAR(255)        NOT NULL,
    "format"      VARCHAR(10)         NOT NULL,
    "jobId"       VARCHAR(255),
    "status"      "AuditExportStatus" NOT NULL DEFAULT 'QUEUED',
    "rowCount"    INTEGER,
    "data"        TEXT,
    "s3Key"       VARCHAR(512),
    "readyAt"     TIMESTAMP(3),
    "expiredAt"   TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3)        NOT NULL,
    "errorMessage" TEXT,
    "createdAt"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "AuditExport_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex
CREATE UNIQUE INDEX "AuditExport_exportId_key" ON "AuditExport"("exportId");

-- Indexes
CREATE INDEX "AuditExport_requestedBy_createdAt_idx" ON "AuditExport"("requestedBy", "createdAt");
CREATE INDEX "AuditExport_status_expiresAt_idx"      ON "AuditExport"("status", "expiresAt");
CREATE INDEX "AuditExport_exportId_idx"              ON "AuditExport"("exportId");
