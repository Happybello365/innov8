-- Migration: normalize_wallet_address_case
--
-- Context
-- -------
-- Authentication in this project is wallet-address-based. The application
-- layer has always stored walletAddress as lowercase (user.service.ts calls
-- address.toLowerCase() before every INSERT/SELECT), but early versions of
-- auth.service.ts did not normalise the address at the service boundary,
-- meaning the raw value provided by the caller was forwarded to
-- findOrCreateUser. Any row that slipped in with mixed-case characters must
-- be normalised to keep the UNIQUE constraint meaningful.
--
-- Safety notes
-- ------------
-- 1. The UPDATE is idempotent: LOWER(walletAddress) = walletAddress for any
--    row that is already lowercase, so running this migration twice is safe.
-- 2. All foreign keys that reference User.walletAddress (Trade.buyerAddress,
--    Trade.sellerAddress, Vault.ownerAddress, …) are updated in a single
--    transaction so referential integrity is preserved.
-- 3. Run this migration against a READ REPLICA first, verify the affected row
--    count is sensible, then apply to primary under a maintenance window if
--    the row count is large.
--
-- Affected tables (sourced from schema.prisma FK graph):
--   "User"                    → walletAddress (the source of truth)
--   "Trade"                   → buyerAddress, sellerAddress
--   "TradeTemplate"           → userAddress, sellerAddress
--   "UserWatchlist"           → userAddress
--   "Dispute"                 → initiator, mediatorAddress
--   "Vault"                   → ownerAddress
--   "UserWallet"              → walletAddress
--   "Webhook"                 → userAddress
--   "InAppNotification"       → userAddress
--   "NotificationPreference"  → userAddress
--   "TradeNote"               → authorAddress
--   "TradeNoteAudit"          → authorAddress
--   "AdminActionAudit"        → actorAddress
--   "PayoutIntent"            → destination, requestedBy
--   "Stream"                  → recipient, terminatedBy, lockedBy
--   "OrphanDeposit"           → depositorAddress
--   "ContractPauseLog"        → guardianAddress
--   "EscrowAudit"             → actor
--   "StreamClawbackEvent"     → admin
--   "DisputeEvidenceRequest"  → requestedBy, requestedFrom
--
-- Execution plan
-- --------------
-- Step 1 – Detect duplicates that would violate the UNIQUE constraint after
--           normalisation. If this query returns rows, resolve them manually
--           before proceeding.

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT LOWER("walletAddress") AS norm_addr, COUNT(*) AS cnt
    FROM "User"
    GROUP BY LOWER("walletAddress")
    HAVING COUNT(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Found % wallet address(es) that would collide after normalisation. '
      'Resolve duplicates before running this migration.',
      dup_count;
  END IF;
END;
$$;

-- Step 2 – Normalise all address columns. Dependent FK columns are updated
--           before the parent so the UNIQUE constraint on User.walletAddress
--           is never transiently violated.

-- Dependent tables first (FK → User.walletAddress)
UPDATE "Trade"
SET "buyerAddress"  = LOWER("buyerAddress"),
    "sellerAddress" = LOWER("sellerAddress")
WHERE "buyerAddress"  <> LOWER("buyerAddress")
   OR "sellerAddress" <> LOWER("sellerAddress");

UPDATE "TradeTemplate"
SET "userAddress"   = LOWER("userAddress"),
    "sellerAddress" = LOWER("sellerAddress")
WHERE "userAddress"   <> LOWER("userAddress")
   OR "sellerAddress" <> LOWER("sellerAddress");

UPDATE "UserWatchlist"
SET "userAddress" = LOWER("userAddress")
WHERE "userAddress" <> LOWER("userAddress");

UPDATE "Dispute"
SET "initiator"       = LOWER("initiator"),
    "mediatorAddress" = LOWER("mediatorAddress")
WHERE "initiator"       <> LOWER("initiator")
   OR ("mediatorAddress" IS NOT NULL AND "mediatorAddress" <> LOWER("mediatorAddress"));

UPDATE "Vault"
SET "ownerAddress" = LOWER("ownerAddress")
WHERE "ownerAddress" <> LOWER("ownerAddress");

UPDATE "UserWallet"
SET "walletAddress" = LOWER("walletAddress")
WHERE "walletAddress" <> LOWER("walletAddress");

UPDATE "Webhook"
SET "userAddress" = LOWER("userAddress")
WHERE "userAddress" <> LOWER("userAddress");

UPDATE "InAppNotification"
SET "userAddress" = LOWER("userAddress")
WHERE "userAddress" <> LOWER("userAddress");

UPDATE "NotificationPreference"
SET "userAddress" = LOWER("userAddress")
WHERE "userAddress" <> LOWER("userAddress");

UPDATE "TradeNote"
SET "authorAddress" = LOWER("authorAddress")
WHERE "authorAddress" <> LOWER("authorAddress");

UPDATE "TradeNoteAudit"
SET "authorAddress" = LOWER("authorAddress")
WHERE "authorAddress" <> LOWER("authorAddress");

UPDATE "AdminActionAudit"
SET "actorAddress" = LOWER("actorAddress")
WHERE "actorAddress" <> LOWER("actorAddress");

UPDATE "PayoutIntent"
SET "destination"  = LOWER("destination"),
    "requestedBy"  = LOWER("requestedBy")
WHERE "destination" <> LOWER("destination")
   OR "requestedBy" <> LOWER("requestedBy");

UPDATE "Stream"
SET "recipient"       = LOWER("recipient"),
    "terminatedBy"    = LOWER("terminatedBy"),
    "lockedBy"        = LOWER("lockedBy")
WHERE "recipient"    <> LOWER("recipient")
   OR ("terminatedBy" IS NOT NULL AND "terminatedBy" <> LOWER("terminatedBy"))
   OR ("lockedBy"     IS NOT NULL AND "lockedBy"     <> LOWER("lockedBy"));

UPDATE "OrphanDeposit"
SET "depositorAddress" = LOWER("depositorAddress")
WHERE "depositorAddress" <> LOWER("depositorAddress");

UPDATE "ContractPauseLog"
SET "guardianAddress" = LOWER("guardianAddress")
WHERE "guardianAddress" <> LOWER("guardianAddress");

UPDATE "EscrowAudit"
SET "actor" = LOWER("actor")
WHERE "actor" IS NOT NULL AND "actor" <> LOWER("actor");

UPDATE "StreamClawbackEvent"
SET "admin" = LOWER("admin")
WHERE "admin" <> LOWER("admin");

UPDATE "DisputeEvidenceRequest"
SET "requestedBy"   = LOWER("requestedBy"),
    "requestedFrom" = LOWER("requestedFrom")
WHERE "requestedBy"   <> LOWER("requestedBy")
   OR "requestedFrom" <> LOWER("requestedFrom");

-- Parent table last
UPDATE "User"
SET "walletAddress" = LOWER("walletAddress")
WHERE "walletAddress" <> LOWER("walletAddress");
