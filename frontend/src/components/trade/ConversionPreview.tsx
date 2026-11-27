"use client";

import { formatCngnAmount, formatNumber } from "@/lib/i18n";
import type { PathPaymentQuote } from "@/lib/api/types";
import type { QuoteStatus } from "@/hooks/usePathPaymentQuote";
import { QUOTE_TTL_MS } from "@/hooks/usePathPaymentQuote";

// ── helpers ────────────────────────────────────────────────────────────────

function assetLabel(
  assetType: string,
  assetCode?: string,
): string {
  if (assetType === "native") return "XLM";
  return assetCode ?? assetType;
}

/** Percentage difference between source and destination, rounded to 2 dp. */
function slippagePct(source: string, destination: string): string {
  const src = parseFloat(source);
  const dst = parseFloat(destination);
  if (!src || !dst) return "—";
  const pct = ((src - dst) / src) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

// ── sub-components ─────────────────────────────────────────────────────────

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-xs text-text-secondary font-medium">{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="animate-spin w-4 h-4 text-gold"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

// ── stale quote banner ──────────────────────────────────────────────────────

interface StaleQuoteBannerProps {
  secondsRemaining: number;
  onRefresh: () => void;
  isStale: boolean;
}

function StaleQuoteBanner({
  secondsRemaining,
  onRefresh,
  isStale,
}: StaleQuoteBannerProps) {
  if (isStale) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="stale-quote-banner"
        className="flex items-center justify-between gap-3 rounded-md bg-status-warning/10 border border-status-warning/40 px-3 py-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            aria-hidden="true"
            className="w-4 h-4 shrink-0 text-status-warning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-xs text-status-warning font-medium leading-tight">
            Quote expired — rates may have changed. Refresh before submitting.
          </p>
        </div>
        <button
          type="button"
          data-testid="refresh-quote-btn"
          onClick={onRefresh}
          className="shrink-0 text-xs font-semibold text-status-warning border border-status-warning/60 rounded-full px-3 py-1 hover:bg-status-warning/10 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  // Fresh quote — show countdown when < 10 s remain.
  if (secondsRemaining <= 10 && secondsRemaining > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="quote-expiry-countdown"
        className="flex items-center justify-between gap-3 rounded-md bg-gold/5 border border-gold/20 px-3 py-2"
      >
        <p className="text-xs text-gold">
          Quote expires in{" "}
          <span className="font-semibold tabular-nums">{secondsRemaining}s</span>
        </p>
        <button
          type="button"
          data-testid="refresh-quote-btn"
          onClick={onRefresh}
          className="text-xs font-semibold text-gold border border-gold/40 rounded-full px-3 py-1 hover:bg-gold/10 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  return null;
}

// ── main component ──────────────────────────────────────────────────────────

export interface ConversionPreviewProps {
  /** Raw NGN amount string computed from qty × price (may be "0" or NaN-safe). */
  sourceAmountNgn: string;
  /** Best-route quote from the backend, or null. */
  quote: PathPaymentQuote | null;
  /** Current lifecycle status. */
  status: QuoteStatus;
  /** Error message when status === "error". */
  errorMessage: string | null;
  /** Seconds until the current quote goes stale. */
  secondsRemaining: number;
  /** Callback to request a fresh quote. */
  onRefresh: () => void;
}

/**
 * Conversion preview panel for the trade review step.
 *
 * Shows:
 *  - Source currency / amount (NGN)
 *  - Destination asset / amount (cNGN)
 *  - Payment path
 *  - Estimated fee (difference between source and destination)
 *  - Slippage indication
 *  - Stale-quote warning with explicit refresh or countdown (#491)
 */
export function ConversionPreview({
  sourceAmountNgn,
  quote,
  status,
  errorMessage,
  secondsRemaining,
  onRefresh,
}: ConversionPreviewProps) {
  const isStale = status === "stale";
  const isFresh = status === "fresh";
  const isLoading = status === "loading";
  const isError = status === "error";
  const isIdle = status === "idle";

  const srcAmount = quote?.source_amount ?? sourceAmountNgn;
  const srcLabel = quote
    ? assetLabel(quote.source_asset_type, quote.source_asset_code)
    : "NGN";
  const dstAmount = quote?.destination_amount ?? "—";
  const dstLabel = quote
    ? assetLabel(quote.destination_asset_type, quote.destination_asset_code)
    : "cNGN";

  const pathLength = Array.isArray(quote?.path) ? quote.path.length : 0;
  const pathDesc =
    pathLength === 0
      ? "Direct"
      : `${pathLength} hop${pathLength > 1 ? "s" : ""}`;

  const fee =
    quote
      ? (() => {
          const src = parseFloat(quote.source_amount);
          const dst = parseFloat(quote.destination_amount);
          if (!isNaN(src) && !isNaN(dst)) {
            const diff = Math.abs(src - dst);
            return `~${formatNumber(diff, { maximumFractionDigits: 4 })} ${srcLabel}`;
          }
          return "—";
        })()
      : "—";

  const slippage = quote
    ? slippagePct(quote.source_amount, quote.destination_amount)
    : "—";

  if (isIdle) return null;

  return (
    <div
      data-testid="conversion-preview"
      className="rounded-lg border border-border-default bg-bg-elevated overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-default bg-bg-surface">
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5 text-gold"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Path Payment Estimate
        </span>
        {isLoading && (
          <span className="ml-auto">
            <Spinner />
          </span>
        )}
        {(isFresh || isStale) && !isLoading && (
          <span
            data-testid="quote-fresh-indicator"
            className={`ml-auto w-2 h-2 rounded-full ${isStale ? "bg-status-warning" : "bg-emerald"}`}
            aria-label={isStale ? "Quote stale" : "Quote fresh"}
          />
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-1 divide-y divide-border-default/60">
        {isLoading && !quote && (
          <p className="text-xs text-text-muted py-3 text-center">
            Fetching best route…
          </p>
        )}

        {isError && (
          <p
            role="alert"
            aria-live="polite"
            data-testid="quote-error"
            className="text-xs text-status-danger py-3 text-center"
          >
            {errorMessage ?? "Could not fetch quote. You can still proceed, but rates may differ."}
          </p>
        )}

        {(isFresh || isStale) && quote && (
          <>
            {/* Source */}
            <div className="flex items-center justify-between py-2.5 gap-2">
              <div className="flex flex-col">
                <span className="text-xs text-text-muted">You send</span>
                <span className="text-sm font-semibold text-text-primary tabular-nums">
                  {formatNumber(parseFloat(srcAmount) || 0, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-text-secondary font-normal">{srcLabel}</span>
                </span>
              </div>

              {/* Arrow */}
              <svg
                aria-hidden="true"
                className="w-4 h-4 text-text-muted shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>

              {/* Destination */}
              <div className="flex flex-col items-end">
                <span className="text-xs text-text-muted">Recipient gets</span>
                <span className="text-sm font-semibold text-gold tabular-nums">
                  {formatCngnAmount(parseFloat(dstAmount) || 0)}{" "}
                  <span className="text-text-secondary font-normal">{dstLabel}</span>
                </span>
              </div>
            </div>

            <QuoteRow label="Path" value={pathDesc} />
            <QuoteRow label="Estimated fee" value={fee} />
            <QuoteRow label="Slippage" value={slippage} />
          </>
        )}
      </div>

      {/* Stale / countdown banner */}
      {(isFresh || isStale) && (
        <div className="px-4 pb-3 pt-1">
          <StaleQuoteBanner
            secondsRemaining={secondsRemaining}
            onRefresh={onRefresh}
            isStale={isStale}
          />
        </div>
      )}
    </div>
  );
}
