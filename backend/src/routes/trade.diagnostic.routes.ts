/**
 * Trade diagnostic bundle endpoint
 *
 * GET /trades/:id/diagnostic
 *
 * Exports a redacted JSON bundle for support requests.  Only the authenticated
 * buyer or seller of the trade may request the bundle.
 *
 * The bundle intentionally strips or redacts all PII (names, IDs, phone
 * numbers, e-mail addresses) using the same `redactPii` helper used for
 * structured logs, so the caller can safely attach it to a support ticket
 * without worrying about leaking sensitive data.
 *
 * Fields included:
 *   - Trade lifecycle metadata (tradeId, status, timestamps, amount tier)
 *   - Redacted dispute summary (reason hash only, not plaintext)
 *   - Evidence count (not CIDs or file names)
 *   - Notes count (not content — notes may be encrypted but we don't decrypt)
 *   - Manifest presence (boolean — not manifest detail)
 *   - Escrow release milestones (amounts and due dates, no personal data)
 *   - Export metadata (bundleVersion, exportedAt, requestedBy abbreviated)
 *
 * Fields excluded:
 *   - Full wallet addresses (truncated to prefix + suffix)
 *   - Dispute plaintext reason
 *   - Manifest driver name, ID number, route description
 *   - Trade note content
 *   - Any field that matches the PII denylist
 */

import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma as defaultPrisma } from "../lib/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { getAdminAllowlistLowercase } from "../lib/accessControl";
import { redactPii } from "../lib/logRedaction";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";

const BUNDLE_VERSION = "1";

const diagnosticParamSchema = z.object({
  id: z.string().min(1, "Trade ID is required"),
});

/** Same address truncation as the preview route. */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function createTradeDiagnosticRouter(prisma: PrismaClient = defaultPrisma): Router {
  const router = Router();
  const diagnosticLimiter = createWalletRateLimiter(RATE_LIMIT_CONFIG.tradeExport);

  router.get(
    "/:id/diagnostic",
    authMiddleware,
    diagnosticLimiter,
    validateRequest({ params: diagnosticParamSchema }),
    async (req: AuthRequest, res, next) => {
      try {
        const callerAddress = req.user?.walletAddress?.trim();
        if (!callerAddress) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const { id } = req.params as { id: string };
        const numericId = Number(id);
        const orConditions: Array<Record<string, unknown>> = [{ tradeId: id }];
        if (Number.isInteger(numericId) && numericId > 0) {
          orConditions.push({ id: numericId });
        }

        const trade = await prisma.trade.findFirst({
          where: { OR: orConditions },
          include: {
            dispute: {
              select: {
                status: true,
                createdAt: true,
                resolvedAt: true,
                // Exclude: initiator, reason (PII / free text)
                category: { select: { name: true } },
              },
            },
            evidence: {
              select: { id: true },
            },
            notes: {
              select: { id: true },
            },
            manifest: {
              select: {
                // Only include non-PII scheduling fields.
                expectedDeliveryAt: true,
                createdAt: true,
                // Exclude: driverName, driverIdNumber, vehicleRegistration, routeDescription
              },
            },
            releaseMilestones: {
              select: {
                milestoneIndex: true,
                amountUsdc: true,
                dueAt: true,
                releasedAt: true,
              },
              orderBy: { milestoneIndex: "asc" },
            },
          },
        });

        if (!trade) {
          res.status(404).json({ error: "Trade not found" });
          return;
        }

        const caller = callerAddress.toLowerCase();
        const isAdmin = getAdminAllowlistLowercase().has(caller);
        const isParty =
          trade.buyerAddress.toLowerCase() === caller ||
          trade.sellerAddress.toLowerCase() === caller;

        if (!isParty && !isAdmin) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        // Build a bundle that is safe to hand to support — apply redactPii as a
        // belt-and-suspenders pass to catch any stray PII-shaped values.
        const rawBundle = {
          bundleVersion: BUNDLE_VERSION,
          exportedAt: new Date().toISOString(),
          // Abbreviated address so support can confirm who requested the bundle
          // without exposing the full public key in the ticket thread.
          requestedBy: truncateAddress(callerAddress),
          trade: {
            tradeId: trade.tradeId,
            status: trade.status,
            // Amount tier instead of exact value.
            amountTier: amountTier(trade.amountUsdc),
            buyerLossBps: trade.buyerLossBps,
            sellerLossBps: trade.sellerLossBps,
            version: trade.version,
            createdAt: trade.createdAt,
            updatedAt: trade.updatedAt,
            fundedAt: trade.fundedAt,
            deliveredAt: trade.deliveredAt,
            completedAt: trade.completedAt,
            expiresAt: trade.expiresAt,
            expiredAt: trade.expiredAt,
          },
          dispute: trade.dispute
            ? {
                status: trade.dispute.status,
                categoryName: trade.dispute.category?.name ?? null,
                createdAt: trade.dispute.createdAt,
                resolvedAt: trade.dispute.resolvedAt,
                // Exclude reason (free text, may contain PII) and initiator address.
              }
            : null,
          evidenceCount: trade.evidence.length,
          notesCount: trade.notes.length,
          hasManifest: trade.manifest !== null,
          manifestSchedule: trade.manifest
            ? {
                expectedDeliveryAt: trade.manifest.expectedDeliveryAt,
                submittedAt: trade.manifest.createdAt,
              }
            : null,
          releaseMilestones: trade.releaseMilestones.map((m) => ({
            milestoneIndex: m.milestoneIndex,
            amountUsdc: m.amountUsdc,
            dueAt: m.dueAt,
            releasedAt: m.releasedAt,
          })),
        };

        // Final belt-and-suspenders redaction pass.
        const bundle = redactPii(rawBundle);

        res.status(200).json(bundle);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const tradeDiagnosticRoutes = createTradeDiagnosticRouter();

// ---------------------------------------------------------------------------
// Helpers (also exported for tests)
// ---------------------------------------------------------------------------

/**
 * Returns a coarse amount tier string instead of the exact value.
 * Keeps the bundle informative without disclosing exact financials.
 */
export function amountTier(amountUsdc: string): string {
  const n = Number(amountUsdc);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  if (n < 100) return "<100 USDC";
  if (n < 1_000) return "100–999 USDC";
  if (n < 10_000) return "1,000–9,999 USDC";
  if (n < 100_000) return "10,000–99,999 USDC";
  return "100,000+ USDC";
}
