-- Backfill tables that schema.prisma has declared for a long time but that
-- no migration ever created. Confirmed via `prisma migrate diff --from-empty
-- --to-schema-datamodel prisma/schema.prisma --script` (computes the exact
-- DDL for the current schema with no live database needed) cross-referenced
-- against every CREATE TABLE across backend/prisma/migrations: these 9
-- tables have no CREATE TABLE anywhere in migration history, even though one
-- of them (Stream) already has three migrations that ALTER it
-- (20260730000000_add_stream_status_and_termination and the two after it),
-- and application code / tests query all of them. Same class of drift as
-- 20260528235959_add_trade_version — evidently applied to a shared database
-- out of band (`prisma db push`) rather than via `prisma migrate`.
--
-- Column/index/constraint definitions below are copied verbatim from that
-- `migrate diff` output (minus the columns the three Stream-ALTER migrations
-- already add — status/terminatedAt/terminatedBy/terminationReason/
-- adminTags/lockedAt/lockedBy/lockReason — and minus Stream_status_idx,
-- which the first of those migrations also already creates), so this
-- reflects exactly what's already in schema.prisma today rather than a
-- hand-typed guess.

-- CreateTable
CREATE TABLE "UserWallet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "walletAddress" VARCHAR(255) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" SERIAL NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "description" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDeliveryAttempt" (
    "id" SERIAL NOT NULL,
    "webhookId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(50) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" TEXT,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" SERIAL NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeNote" (
    "id" SERIAL NOT NULL,
    "tradeId" VARCHAR(255) NOT NULL,
    "authorAddress" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" SERIAL NOT NULL,
    "streamId" VARCHAR(255) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "totalVested" VARCHAR(100) NOT NULL,
    "claimed" VARCHAR(100) NOT NULL DEFAULT '0',
    "unclaimed" VARCHAR(100) NOT NULL DEFAULT '0',
    "pendingClawback" VARCHAR(100) NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamClawbackEvent" (
    "id" SERIAL NOT NULL,
    "streamId" VARCHAR(255) NOT NULL,
    "admin" VARCHAR(255) NOT NULL,
    "amount" VARCHAR(100) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "txHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamClawbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrphanDeposit" (
    "id" SERIAL NOT NULL,
    "ledgerSeq" INTEGER NOT NULL,
    "txHash" VARCHAR(255) NOT NULL,
    "depositorAddress" VARCHAR(255) NOT NULL,
    "amountRaw" VARCHAR(100) NOT NULL,
    "assetId" VARCHAR(255) NOT NULL,
    "contractTradeId" VARCHAR(255),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedTradeId" VARCHAR(255),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OrphanDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPauseLog" (
    "id" SERIAL NOT NULL,
    "paused" BOOLEAN NOT NULL,
    "guardianAddress" VARCHAR(255) NOT NULL,
    "reason" VARCHAR(500),
    "txHash" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractPauseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserWallet_userId_idx" ON "UserWallet"("userId");

-- CreateIndex
CREATE INDEX "UserWallet_walletAddress_idx" ON "UserWallet"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UserWallet_userId_walletAddress_key" ON "UserWallet"("userId", "walletAddress");

-- CreateIndex
CREATE INDEX "Webhook_userAddress_createdAt_idx" ON "Webhook"("userAddress", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDeliveryAttempt_webhookId_timestamp_idx" ON "WebhookDeliveryAttempt"("webhookId", "timestamp");

-- CreateIndex
CREATE INDEX "InAppNotification_userAddress_isRead_createdAt_idx" ON "InAppNotification"("userAddress", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "TradeNote_tradeId_authorAddress_createdAt_idx" ON "TradeNote"("tradeId", "authorAddress", "createdAt");

-- CreateIndex
CREATE INDEX "TradeNote_tradeId_createdAt_idx" ON "TradeNote"("tradeId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeNote_authorAddress_idx" ON "TradeNote"("authorAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Stream_streamId_key" ON "Stream"("streamId");

-- CreateIndex
CREATE INDEX "Stream_streamId_idx" ON "Stream"("streamId");

-- CreateIndex
CREATE INDEX "Stream_recipient_idx" ON "Stream"("recipient");

-- CreateIndex
CREATE INDEX "StreamClawbackEvent_streamId_idx" ON "StreamClawbackEvent"("streamId");

-- CreateIndex
CREATE INDEX "StreamClawbackEvent_admin_idx" ON "StreamClawbackEvent"("admin");

-- CreateIndex
CREATE UNIQUE INDEX "StreamClawbackEvent_streamId_txHash_key" ON "StreamClawbackEvent"("streamId", "txHash");

-- CreateIndex
CREATE UNIQUE INDEX "OrphanDeposit_txHash_key" ON "OrphanDeposit"("txHash");

-- CreateIndex
CREATE INDEX "OrphanDeposit_resolved_idx" ON "OrphanDeposit"("resolved");

-- CreateIndex
CREATE INDEX "OrphanDeposit_depositorAddress_idx" ON "OrphanDeposit"("depositorAddress");

-- CreateIndex
CREATE INDEX "OrphanDeposit_txHash_idx" ON "OrphanDeposit"("txHash");

-- CreateIndex
CREATE INDEX "ContractPauseLog_paused_createdAt_idx" ON "ContractPauseLog"("paused", "createdAt");

-- CreateIndex
CREATE INDEX "ContractPauseLog_guardianAddress_idx" ON "ContractPauseLog"("guardianAddress");

-- AddForeignKey
ALTER TABLE "UserWallet" ADD CONSTRAINT "UserWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userAddress_fkey" FOREIGN KEY ("userAddress") REFERENCES "User"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userAddress_fkey" FOREIGN KEY ("userAddress") REFERENCES "User"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeNote" ADD CONSTRAINT "TradeNote_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("tradeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamClawbackEvent" ADD CONSTRAINT "StreamClawbackEvent_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("streamId") ON DELETE CASCADE ON UPDATE CASCADE;
