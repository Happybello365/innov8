/**
 * Account Deletion Data Export Service (issue #458)
 *
 * Generates a structured, reviewable export of all data owned by a user
 * before account deletion is finalized. The export is stored as a JSON
 * snapshot in Redis (keyed by walletAddress, TTL = 72 h) so the user or
 * an admin can retrieve and verify its contents before the irreversible
 * DELETE is committed.
 *
 * Workflow:
 *  1. Caller (privacy route / deletion job) calls `generateDeletionExport(address)`.
 *  2. The service fetches every table that holds user-owned data.
 *  3. The serialised snapshot is written to Redis under
 *     `deletion_export:<normalised_address>` with a 72-hour TTL.
 *  4. The service returns the snapshot so the caller can respond
 *     synchronously (for small accounts) or store a job result reference.
 *
 * Data included in the export mirrors the GDPR "right to portability" surface:
 *   - profile fields (no raw secrets)
 *   - trades (buyer + seller)
 *   - disputes initiated
 *   - savings vaults and goals
 *   - trade templates and watchlist
 *   - notifications and preferences
 *   - webhook subscriptions (URL only, never the secret)
 *   - in-app notifications
 *
 * Fields that are never exported:
 *   - tokenHash / jti from RefreshToken (session credentials)
 *   - WebhookSubscription.secretHash (signing secret)
 *   - Any column in PII_FIELD_DENYLIST that holds a raw credential
 */

import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { redis } from "../lib/redis";
import { appLogger } from "../middleware/logger";
import { AppError, ErrorCode } from "../errors/errorCodes";

const EXPORT_KEY_PREFIX = "deletion_export:";
/** How long the snapshot lives in Redis before it is auto-evicted (seconds). */
const EXPORT_TTL_SECONDS = 72 * 60 * 60; // 72 hours

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export interface DeletionExport {
  exportedAt: string;
  walletAddress: string;
  profile: {
    walletAddress: string;
    displayName: string;
    createdAt: Date;
  } | null;
  trades: {
    buyer: unknown[];
    seller: unknown[];
  };
  disputes: unknown[];
  vaults: unknown[];
  goals: unknown[];
  tradeTemplates: unknown[];
  watchlist: unknown[];
  webhookSubscriptions: { url: string; events: string[]; isActive: boolean; createdAt: Date }[];
  notifications: unknown[];
  notificationPreference: unknown;
}

export class AccountDeletionExportService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Generate and cache a deletion export for `address`.
   *
   * Returns the snapshot. If a cached snapshot already exists for this address
   * it is overwritten (the caller should regenerate before each deletion attempt).
   */
  async generateDeletionExport(address: string): Promise<DeletionExport> {
    const walletAddress = normalizeAddress(address);

    const user = await this.db.user.findUnique({
      where: { walletAddress },
      select: {
        walletAddress: true,
        displayName: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, "User not found", 404);
    }

    // Fetch all user-owned data in parallel for efficiency.
    const [
      tradesBought,
      tradesSold,
      disputes,
      vaults,
      goals,
      tradeTemplates,
      watchlist,
      webhookSubscriptions,
      notifications,
      notificationPreference,
    ] = await Promise.all([
      this.db.trade.findMany({
        where: { buyerAddress: walletAddress },
        select: {
          tradeId: true,
          sellerAddress: true,
          amountUsdc: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.db.trade.findMany({
        where: { sellerAddress: walletAddress },
        select: {
          tradeId: true,
          buyerAddress: true,
          amountUsdc: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.db.dispute.findMany({
        where: { initiator: walletAddress },
        select: {
          tradeId: true,
          reason: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
      this.db.vault.findMany({
        where: { ownerAddress: walletAddress },
        select: {
          vaultId: true,
          balanceUsdc: true,
          createdAt: true,
        },
      }),
      this.db.goal.findMany({
        where: { user: { walletAddress } },
        select: {
          goalId: true,
          vaultId: true,
          targetAmountUsdc: true,
          currentAmountUsdc: true,
          deadline: true,
          status: true,
          createdAt: true,
        },
      }),
      this.db.tradeTemplate.findMany({
        where: { userAddress: walletAddress },
        select: {
          name: true,
          sellerAddress: true,
          amountUsdc: true,
          buyerLossBps: true,
          sellerLossBps: true,
          createdAt: true,
        },
      }),
      this.db.userWatchlist.findMany({
        where: { userAddress: walletAddress },
        select: {
          tradeId: true,
          createdAt: true,
        },
      }),
      this.db.webhookSubscription.findMany({
        where: { user: { walletAddress } },
        select: {
          url: true,
          events: true,
          isActive: true,
          createdAt: true,
          // secretHash intentionally excluded
        },
      }),
      this.db.inAppNotification.findMany({
        where: { userAddress: walletAddress },
        select: {
          title: true,
          message: true,
          type: true,
          isRead: true,
          createdAt: true,
        },
      }),
      this.db.notificationPreference.findUnique({
        where: { userAddress: walletAddress },
        select: {
          preferences: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const snapshot: DeletionExport = {
      exportedAt: new Date().toISOString(),
      walletAddress,
      profile: user,
      trades: { buyer: tradesBought, seller: tradesSold },
      disputes,
      vaults,
      goals,
      tradeTemplates,
      watchlist,
      webhookSubscriptions,
      notifications,
      notificationPreference,
    };

    // Persist to Redis so the caller (and admin) can retrieve it before DELETE.
    try {
      const key = `${EXPORT_KEY_PREFIX}${walletAddress}`;
      await redis.set(key, JSON.stringify(snapshot), "EX", EXPORT_TTL_SECONDS);
      appLogger.info(
        { walletAddress, ttlSeconds: EXPORT_TTL_SECONDS },
        "Account deletion export cached in Redis",
      );
    } catch (cacheErr) {
      // A Redis failure must never prevent the export from being returned.
      appLogger.error(
        { err: cacheErr, walletAddress },
        "Account deletion export: failed to cache snapshot (export still returned)",
      );
    }

    return snapshot;
  }

  /**
   * Retrieve a previously generated deletion export from the Redis cache.
   * Returns null when no export is cached (expired or never generated).
   */
  async getCachedExport(address: string): Promise<DeletionExport | null> {
    const walletAddress = normalizeAddress(address);
    const key = `${EXPORT_KEY_PREFIX}${walletAddress}`;
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as DeletionExport;
    } catch (err) {
      appLogger.error({ err, walletAddress }, "Account deletion export: failed to retrieve cache");
      return null;
    }
  }

  /**
   * Remove the cached export for `address` (called after deletion completes).
   */
  async evictCachedExport(address: string): Promise<void> {
    const walletAddress = normalizeAddress(address);
    const key = `${EXPORT_KEY_PREFIX}${walletAddress}`;
    try {
      await redis.del(key);
    } catch (err) {
      appLogger.debug({ err, walletAddress }, "Account deletion export: eviction failed (non-fatal)");
    }
  }
}

export const accountDeletionExportService = new AccountDeletionExportService();
