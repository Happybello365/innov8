/**
 * Wallet Ownership Challenge Cleanup Service (issue #456)
 *
 * Redis stores challenge keys with a TTL (CHALLENGE_TTL = 300 s), so they
 * expire naturally under normal load. This service handles two scenarios
 * that the automatic TTL does not cover:
 *
 *  1. Keys written before TTL enforcement was added (backfill).
 *  2. Redis instances that do not enforce key expiry reliably (e.g. maxmemory
 *     policy = noeviction, or a TTL that was silently not set).
 *
 * It scans for keys matching the `challenge:*` prefix, checks whether the
 * key carries a TTL, and deletes any whose TTL is either missing (no-expiry)
 * or whose total age since the timestamp embedded in the value exceeds the
 * configured stale threshold.
 *
 * Because challenge values are opaque random strings (not timestamps), we
 * rely solely on the Redis TTL to determine staleness. A key with TTL <= 0
 * (already expired but not yet evicted) or TTL === -1 (persisted, no expiry)
 * is treated as stale and removed.
 *
 * Metrics exposed:
 *   - scanned: total challenge keys inspected
 *   - deleted: keys removed (stale or no-expiry)
 *   - errors: scan/delete failures (non-fatal; logged individually)
 */

import { redis } from "../lib/redis";
import { appLogger } from "../middleware/logger";

export const CHALLENGE_KEY_PREFIX = "challenge:";
/** Scan batch size — keep low to avoid blocking the Redis event loop. */
const SCAN_BATCH = 200;

export interface ChallengeCleanupResult {
  scanned: number;
  deleted: number;
  errors: number;
}

export class WalletChallengeCleanupService {
  /**
   * Scan and expire stale wallet ownership challenge keys.
   *
   * Returns a summary of how many keys were scanned, deleted, and errored.
   * The function never throws; individual errors are counted and logged.
   */
  async cleanupStaleChallenges(): Promise<ChallengeCleanupResult> {
    const result: ChallengeCleanupResult = { scanned: 0, deleted: 0, errors: 0 };

    appLogger.info("Wallet challenge cleanup: starting scan");

    try {
      let cursor = "0";
      do {
        let keys: string[];
        try {
          const [nextCursor, found] = await redis.scan(
            cursor,
            "MATCH",
            `${CHALLENGE_KEY_PREFIX}*`,
            "COUNT",
            SCAN_BATCH,
          );
          cursor = nextCursor;
          keys = found;
        } catch (scanErr) {
          result.errors++;
          appLogger.error(
            { err: scanErr, cursor },
            "Wallet challenge cleanup: SCAN failed",
          );
          break;
        }

        for (const key of keys) {
          result.scanned++;
          try {
            const ttl = await redis.ttl(key);
            // ttl === -2: key does not exist (evicted between SCAN and TTL)
            // ttl === -1: key exists but has no expiry — treat as stale
            // ttl === 0 or negative: expired but not yet evicted
            if (ttl === -2) {
              // Already gone — nothing to do.
              continue;
            }
            if (ttl === -1 || ttl === 0) {
              await redis.del(key);
              result.deleted++;
              appLogger.debug(
                { key, ttl },
                "Wallet challenge cleanup: deleted stale key",
              );
            }
            // ttl > 0 → still live and valid, skip.
          } catch (keyErr) {
            result.errors++;
            appLogger.error(
              { err: keyErr, key },
              "Wallet challenge cleanup: error processing key",
            );
          }
        }
      } while (cursor !== "0");
    } catch (outerErr) {
      result.errors++;
      appLogger.error(
        { err: outerErr },
        "Wallet challenge cleanup: unexpected outer error",
      );
    }

    appLogger.info(
      { scanned: result.scanned, deleted: result.deleted, errors: result.errors },
      "Wallet challenge cleanup: scan complete",
    );

    return result;
  }
}

export const walletChallengeCleanupService = new WalletChallengeCleanupService();
