-- Migration: add trade archive lifecycle fields (#454)
-- archivedAt: set when a trade is archived; null means active.
-- archivedBy: wallet address of the actor that triggered the archive/restore.
ALTER TABLE "Trade" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Trade" ADD COLUMN "archivedBy" VARCHAR(255);

-- Index so archived trade queries stay fast.
CREATE INDEX "Trade_archivedAt_idx" ON "Trade"("archivedAt");
