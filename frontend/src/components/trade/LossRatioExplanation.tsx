"use client";

/**
 * LossRatioExplanation (#489)
 *
 * Explains negotiated loss-sharing percentages and resulting party amounts
 * before confirmation.
 *
 * Visual design:
 *   - A single stacked/segmented horizontal bar split between buyer (gold)
 *     and seller (emerald) with percentage labels.
 *   - Below the bar: two cards showing each party's label, percentage, and
 *     the computed cNGN amount they would bear in a worst-case total loss.
 *   - A footnote clarifies that the ratios only apply when a loss event occurs
 *     (not under normal settlement) so users are not confused.
 *
 * Accessibility:
 *   - The bar segments are `role="meter"` elements with aria-valuenow /
 *     aria-valuemin / aria-valuemax so AT announces "Buyer 30 out of 100".
 *   - The surrounding `<section>` has an aria-label.
 *   - No colour-only encoding — labels and percentages are always shown.
 *
 * Usage: drop it into `TradeDetailPage` before the `TxSummaryModal` opens,
 * or embed it inside `TxSummaryModal`'s body as a custom child slot.
 */

import React from "react";

export interface LossRatioExplanationProps {
  /** Buyer's loss share in basis points (0–10 000). */
  buyerLossBps: number;
  /** Seller's loss share in basis points (0–10 000). */
  sellerLossBps: number;
  /**
   * Total locked amount in the same unit as `amountUnit`.
   * Used to compute absolute worst-case loss per party.
   */
  totalAmount?: number;
  /** Currency / unit label shown next to computed amounts. Defaults to "cNGN". */
  amountUnit?: string;
  /** Override label for the buyer party. Defaults to "Buyer". */
  buyerLabel?: string;
  /** Override label for the seller party. Defaults to "Seller". */
  sellerLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert basis points to a display percentage string, e.g. 3000 → "30.00". */
function bpsToDisplayPct(bps: number): string {
  return (bps / 100).toFixed(2);
}

/** Format a number with comma thousands separators. */
function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SegmentedBar({
  buyerPct,
  sellerPct,
  buyerLabel,
  sellerLabel,
}: {
  buyerPct: number;
  sellerPct: number;
  buyerLabel: string;
  sellerLabel: string;
}) {
  // Guard: clamp values so the bar always adds up to exactly 100 regardless
  // of floating-point drift.
  const totalPct = buyerPct + sellerPct;
  const safeBuyer = totalPct > 0 ? (buyerPct / totalPct) * 100 : 50;
  const safeSeller = totalPct > 0 ? (sellerPct / totalPct) * 100 : 50;

  return (
    <div>
      {/* Bar */}
      <div
        className="flex h-5 w-full overflow-hidden rounded-full"
        aria-label={`Loss share bar: ${buyerLabel} ${buyerPct.toFixed(2)}%, ${sellerLabel} ${sellerPct.toFixed(2)}%`}
      >
        {/* Buyer segment */}
        <div
          role="meter"
          aria-label={`${buyerLabel} loss share`}
          aria-valuenow={buyerPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${buyerPct.toFixed(2)}%`}
          className="h-full bg-gold flex items-center justify-center transition-all duration-700"
          style={{ width: `${safeBuyer}%` }}
        >
          {safeBuyer > 15 && (
            <span
              aria-hidden
              className="text-[10px] font-bold text-text-inverse select-none"
            >
              {buyerPct.toFixed(0)}%
            </span>
          )}
        </div>

        {/* Seller segment */}
        <div
          role="meter"
          aria-label={`${sellerLabel} loss share`}
          aria-valuenow={sellerPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${sellerPct.toFixed(2)}%`}
          className="h-full bg-accent-emerald flex items-center justify-center transition-all duration-700"
          style={{ width: `${safeSeller}%` }}
        >
          {safeSeller > 15 && (
            <span
              aria-hidden
              className="text-[10px] font-bold text-text-inverse select-none"
            >
              {sellerPct.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div aria-hidden className="mt-2 flex justify-between text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gold" />
          {buyerLabel}
        </span>
        <span className="flex items-center gap-1">
          {sellerLabel}
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent-emerald" />
        </span>
      </div>
    </div>
  );
}

interface PartyCardProps {
  label: string;
  percentage: string;
  amount?: string;
  unit: string;
  colorClass: string;
}

function PartyCard({ label, percentage, amount, unit, colorClass }: PartyCardProps) {
  return (
    <div className="flex-1 rounded-lg border border-border-default bg-bg-elevated p-4 space-y-1">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`inline-block w-2.5 h-2.5 rounded-full ${colorClass}`}
        />
        <span className="text-xs uppercase tracking-wide text-text-muted font-semibold">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-text-primary tabular-nums">
        {percentage}
        <span className="text-sm font-medium text-text-muted ml-1">%</span>
      </p>
      {amount && (
        <p className="text-xs text-text-secondary">
          Max loss:{" "}
          <span className="font-semibold text-text-primary font-mono">
            {amount} {unit}
          </span>
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LossRatioExplanation({
  buyerLossBps,
  sellerLossBps,
  totalAmount,
  amountUnit = "cNGN",
  buyerLabel = "Buyer",
  sellerLabel = "Seller",
}: LossRatioExplanationProps) {
  const buyerPct = buyerLossBps / 100;
  const sellerPct = sellerLossBps / 100;

  const buyerAmount =
    totalAmount != null
      ? formatAmount((buyerLossBps / 10000) * totalAmount)
      : undefined;

  const sellerAmount =
    totalAmount != null
      ? formatAmount((sellerLossBps / 10000) * totalAmount)
      : undefined;

  return (
    <section
      aria-label="Loss-sharing ratio explanation"
      className="rounded-xl border border-border-default bg-card p-5 shadow-card space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-text-secondary tracking-wide uppercase">
          Loss-Sharing Ratio
        </h3>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">
          If a loss event occurs, the trade value is distributed according to
          these negotiated percentages. Under normal settlement both parties
          receive their full agreed amounts.
        </p>
      </div>

      {/* Segmented bar */}
      <SegmentedBar
        buyerPct={buyerPct}
        sellerPct={sellerPct}
        buyerLabel={buyerLabel}
        sellerLabel={sellerLabel}
      />

      {/* Party cards */}
      <div className="flex gap-3">
        <PartyCard
          label={buyerLabel}
          percentage={bpsToDisplayPct(buyerLossBps)}
          amount={buyerAmount}
          unit={amountUnit}
          colorClass="bg-gold"
        />
        <PartyCard
          label={sellerLabel}
          percentage={bpsToDisplayPct(sellerLossBps)}
          amount={sellerAmount}
          unit={amountUnit}
          colorClass="bg-accent-emerald"
        />
      </div>

      {/* Disclaimer footnote */}
      <p className="text-[11px] text-text-muted border-t border-border-default pt-3 leading-relaxed">
        <span className="font-semibold">Note:</span> These ratios only apply
        when a mediator-confirmed loss event occurs. Successful delivery
        releases the full escrowed amount to the seller.
      </p>
    </section>
  );
}

export default LossRatioExplanation;
