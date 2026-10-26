/**
 * Nightly treasury ledger-vs-on-chain reconciliation (#209).
 *
 * Compares the Soroban escrow contract's on-chain balance to the sum of all
 * active trade amounts recorded in the database.  Produces a diff report and
 * dispatches an alert when drift exceeds the configurable tolerance.
 */

import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { StellarService } from "./stellar.service";
import { alertService } from "./alert.service";
import { appLogger } from "../middleware/logger";
import { cacheGet, cacheSet } from "../lib/cache";
import { env } from "../config/env";
import { TOKEN_CONFIG } from "../config/token";
import { parseDecimalToStroops } from "../lib/money";

const TREASURY_DRIFT_CACHE_KEY = "treasury:reconciliation:drift";
const TREASURY_DRIFT_CACHE_TTL_SECONDS = 600;

export type TreasuryDriftSeverity = "none" | "warning" | "critical";

export interface TreasuryReconciliationReport {
  reportId: string;
  contractId: string;
  assetCode: string;
  onChainBalance: string;
  dbComputedBalance: string;
  drift: string;
  driftBps: number;
  severity: TreasuryDriftSeverity;
  activeTrades: number;
  generatedAt: string;
}

type TreasuryPrisma = Pick<PrismaClient, "trade">;

export class TreasuryReconciliationService {
  private prisma: TreasuryPrisma;
  private stellarService: StellarService;

  constructor(prisma: TreasuryPrisma = defaultPrisma) {
    this.prisma = prisma;
    this.stellarService = new StellarService();
  }

  /**
   * Run the nightly treasury reconciliation.
   *
   * 1. Fetch the on-chain balance of the escrow contract from Horizon.
   * 2. Sum the `amountUsdc` of all active (FUNDED / DELIVERED / DISPUTED) trades.
   * 3. Compute drift, classify severity, cache the report, and alert on drift.
   */
  async run(): Promise<TreasuryReconciliationReport> {
    const reportId = `treasury-recon-${Date.now()}`;
    const contractId = env.AMANA_ESCROW_CONTRACT_ID;

    appLogger.info({ reportId, contractId }, "Starting treasury reconciliation");

    const [onChainBalanceStr, { dbBalance, activeTrades }] = await Promise.all([
      this.stellarService.getAccountBalance(contractId, TOKEN_CONFIG.symbol),
      this.computeDbBalance(),
    ]);

    const onChain = BigInt(onChainBalanceStr);
    const drift = onChain - dbBalance;
    const driftAbs = drift < 0n ? -drift : drift;
    const driftBps =
      dbBalance > 0n ? Number((driftAbs * 10_000n) / dbBalance) : 0;

    const severity = this.classifySeverity(driftBps);

    const report: TreasuryReconciliationReport = {
      reportId,
      contractId,
      assetCode: TOKEN_CONFIG.symbol,
      onChainBalance: onChainBalanceStr,
      dbComputedBalance: dbBalance.toString(),
      drift: drift.toString(),
      driftBps,
      severity,
      activeTrades,
      generatedAt: new Date().toISOString(),
    };

    await cacheSet(TREASURY_DRIFT_CACHE_KEY, report, TREASURY_DRIFT_CACHE_TTL_SECONDS);

    if (severity === "critical") {
      await alertService.dispatch(
        "treasury_reconciliation_critical",
        `Treasury drift critical: ${driftBps} bps (${drift} stroops)`,
        { reportId, contractId, driftBps, drift: drift.toString() },
      );
    } else if (severity === "warning") {
      await alertService.dispatch(
        "treasury_reconciliation_warning",
        `Treasury drift warning: ${driftBps} bps (${drift} stroops)`,
        { reportId, contractId, driftBps, drift: drift.toString() },
      );
    }

    appLogger.info(
      { reportId, driftBps, severity, activeTrades },
      "Treasury reconciliation complete",
    );

    return report;
  }

  /** Sum `amountUsdc` of all escrow-active trades in stroops. */
  private async computeDbBalance(): Promise<{ dbBalance: bigint; activeTrades: number }> {
    const trades = await this.prisma.trade.findMany({
      where: { status: { in: ["FUNDED", "DELIVERED", "DISPUTED"] } },
      select: { amountUsdc: true },
    });

    const dbBalance = trades.reduce(
      (sum, t) => sum + parseDecimalToStroops(t.amountUsdc),
      0n,
    );

    return { dbBalance, activeTrades: trades.length };
  }

  private classifySeverity(driftBps: number): TreasuryDriftSeverity {
    const warn = env.RECONCILIATION_WARNING_THRESHOLD_BPS ?? 100;
    const crit = env.RECONCILIATION_CRITICAL_THRESHOLD_BPS ?? 1000;
    if (driftBps > crit) return "critical";
    if (driftBps > warn) return "warning";
    return "none";
  }

  /** Latest cached report for the admin dashboard. */
  async getLatestReport(): Promise<TreasuryReconciliationReport | null> {
    return cacheGet<TreasuryReconciliationReport>(TREASURY_DRIFT_CACHE_KEY);
  }
}

export const treasuryReconciliationService = new TreasuryReconciliationService();
