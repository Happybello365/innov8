/**
 * Pluggable fraud-signal provider hook (#210).
 *
 * Before a high-value trade is created the controller calls
 * `FraudSignalService.check()`.  A no-op default is shipped so behaviour is
 * unchanged until a real provider is wired in.
 *
 * Configuration
 * ─────────────
 * FRAUD_SIGNAL_THRESHOLD_USDC  – decimal USDC amount above which the hook
 *                                 fires.  Unset / blank → hook never fires.
 */

import { AppError, ErrorCode } from "../errors/errorCodes";
import { appLogger } from "../middleware/logger";
import { parseDecimalToStroops } from "../lib/money";

export const FRAUD_SIGNAL_THRESHOLD_ENV = "FRAUD_SIGNAL_THRESHOLD_USDC";

export interface FraudSignalContext {
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: string;
}

export interface FraudSignalResult {
  allowed: boolean;
  reason?: string;
}

/** Implement this interface to plug in a real fraud/risk provider. */
export interface FraudSignalProvider {
  evaluate(ctx: FraudSignalContext): Promise<FraudSignalResult>;
}

/** No-op provider: every trade is allowed. */
export class NoopFraudSignalProvider implements FraudSignalProvider {
  async evaluate(_ctx: FraudSignalContext): Promise<FraudSignalResult> {
    return { allowed: true };
  }
}

export class FraudSignalBlockedError extends AppError {
  constructor(reason: string) {
    super(
      ErrorCode.VALIDATION_ERROR,
      `Trade blocked by fraud-signal provider: ${reason}`,
      422,
    );
    this.name = "FraudSignalBlockedError";
  }
}

export class FraudSignalService {
  constructor(
    private readonly provider: FraudSignalProvider = new NoopFraudSignalProvider(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /** Parse the configured threshold into stroops, or null for "never fire". */
  private getThreshold(): bigint | null {
    const raw = this.env[FRAUD_SIGNAL_THRESHOLD_ENV]?.trim();
    if (!raw) return null;
    const stroops = parseDecimalToStroops(raw);
    return stroops > 0n ? stroops : null;
  }

  /**
   * Run the fraud check if the trade exceeds the configured threshold.
   * Throws FraudSignalBlockedError when the provider rejects the trade.
   */
  async check(ctx: FraudSignalContext): Promise<void> {
    const threshold = this.getThreshold();
    if (threshold === null) return;

    const amountStroops = parseDecimalToStroops(ctx.amountUsdc);
    if (amountStroops <= threshold) return;

    appLogger.info(
      { buyer: ctx.buyerAddress.slice(0, 8), amountUsdc: ctx.amountUsdc },
      "Fraud signal check: amount exceeds threshold",
    );

    const result = await this.provider.evaluate(ctx);
    if (!result.allowed) {
      throw new FraudSignalBlockedError(result.reason ?? "provider rejected trade");
    }
  }
}

export const fraudSignalService = new FraudSignalService();
