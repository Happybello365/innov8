-- Add optimistic concurrency version counter to Trade for race-safe status transitions.
--
-- schema.prisma has declared `Trade.version Int @default(0)` since before this
-- migration history existed, but no migration ever actually added the column —
-- it was evidently applied to shared databases out of band (e.g. `prisma db
-- push`) rather than via `prisma migrate`, so `migrate deploy` against a fresh
-- database (such as CI's ephemeral test Postgres) fails on
-- 20260529000002_add_missing_indexes, which creates an index on
-- "Trade"."version" assuming the column already exists.
--
-- IF NOT EXISTS so this is a no-op anywhere the column was already added
-- out of band.
ALTER TABLE "Trade"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
