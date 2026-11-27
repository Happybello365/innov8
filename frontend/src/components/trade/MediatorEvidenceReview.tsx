"use client";

/**
 * MediatorEvidenceReview (#488)
 *
 * Side-by-side evidence comparison panel for mediators.
 *
 * Layout:
 *   - Two equal-width evidence columns (buyer left, driver/seller right)
 *   - Each column shows an `EvidenceMetadataPanel` (video + metadata)
 *   - A centre divider with a "Compare" label keeps both panels in view
 *   - Collapses to a stacked single-column layout on small screens
 *   - The surrounding task context (dispute ID, parties) stays visible at the
 *     top so the mediator never loses their place
 *
 * Task context is always preserved — a sticky header shows dispute ID, trade
 * amount, and party addresses, so scrolling through long evidence panels
 * does not lose context.
 */

import React from "react";
import { EvidenceMetadataPanel } from "@/components/ui/EvidenceMetadataPanel";
import { WalletAddressBadge } from "@/components/ui/WalletAddressBadge";
import { Badge } from "@/components/ui/Badge";

export interface EvidenceSide {
  /** Display label, e.g. "Buyer" or "Driver / Seller" */
  partyLabel: string;
  /** Stellar wallet address of the submitting party */
  walletAddress: string;
  /** IPFS CID of the evidence video */
  cid: string;
  /** Original file name */
  fileName?: string;
  /** Hex SHA-256 checksum */
  checksum?: string;
  /** MIME type */
  mimeType?: string;
  /** ISO-8601 upload timestamp */
  uploadedAt?: string;
  /** Pre-resolved gateway video URL. Falls back to Pinata when omitted. */
  videoSrc?: string;
}

export interface MediatorEvidenceReviewProps {
  disputeId: string;
  tradeId: string;
  /** Amount in cNGN / USDC with currency label already appended */
  tradeAmount: string;
  buyer: EvidenceSide;
  seller: EvidenceSide;
  /** e.g. "testnet" | "public" */
  explorerNetwork?: "testnet" | "public";
  /**
   * Optional slot rendered below the evidence panels — intended for the
   * resolution action buttons in `MediatorPanelClient` so the full panel
   * can be composed without prop-drilling the entire resolution state.
   */
  resolutionPanel?: React.ReactNode;
}

// ─── Context header ───────────────────────────────────────────────────────────

function ContextHeader({
  disputeId,
  tradeId,
  tradeAmount,
  buyerAddress,
  sellerAddress,
  explorerNetwork,
}: {
  disputeId: string;
  tradeId: string;
  tradeAmount: string;
  buyerAddress: string;
  sellerAddress: string;
  explorerNetwork?: "testnet" | "public";
}) {
  return (
    <div
      className="bg-bg-elevated border border-border-default rounded-xl p-4 mb-6 sticky top-0 z-10 shadow-card"
      aria-label="Dispute context summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* IDs */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Dispute
          </p>
          <p className="font-mono text-sm font-semibold text-text-primary">
            #{disputeId}
          </p>
          <p className="text-xs text-text-muted">
            Trade{" "}
            <span className="font-mono text-text-secondary">{tradeId}</span>
          </p>
        </div>

        {/* Amount */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Amount
          </p>
          <p className="font-mono text-sm font-semibold text-text-primary">
            {tradeAmount}
          </p>
        </div>

        {/* Parties */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="info">Buyer</Badge>
            <WalletAddressBadge
              address={buyerAddress}
              truncate="middle"
              showCopy
              showExplorer
              explorerNetwork={explorerNetwork}
              className="text-xs"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="success">Seller</Badge>
            <WalletAddressBadge
              address={sellerAddress}
              truncate="middle"
              showCopy
              showExplorer
              explorerNetwork={explorerNetwork}
              className="text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MediatorEvidenceReview({
  disputeId,
  tradeId,
  tradeAmount,
  buyer,
  seller,
  explorerNetwork = "testnet",
  resolutionPanel,
}: MediatorEvidenceReviewProps) {
  return (
    <section
      aria-label={`Mediator evidence review for dispute ${disputeId}`}
      className="space-y-6"
    >
      {/* Context header — stays visible while scrolling */}
      <ContextHeader
        disputeId={disputeId}
        tradeId={tradeId}
        tradeAmount={tradeAmount}
        buyerAddress={buyer.walletAddress}
        sellerAddress={seller.walletAddress}
        explorerNetwork={explorerNetwork}
      />

      {/* Side-by-side evidence panels */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        aria-label="Evidence comparison"
      >
        {/* Buyer evidence */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="info">Buyer Evidence</Badge>
            <WalletAddressBadge
              address={buyer.walletAddress}
              truncate="middle"
              showCopy
              explorerNetwork={explorerNetwork}
              className="text-xs"
            />
          </div>
          <EvidenceMetadataPanel
            cid={buyer.cid}
            fileName={buyer.fileName}
            checksum={buyer.checksum}
            mimeType={buyer.mimeType}
            uploadedAt={buyer.uploadedAt}
            videoSrc={buyer.videoSrc}
          />
        </div>

        {/* Divider — visible on desktop between panels */}
        <div
          aria-hidden
          className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-border-default pointer-events-none"
          style={{ position: "relative" }}
        />

        {/* Seller / Driver evidence */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="success">Seller / Driver Evidence</Badge>
            <WalletAddressBadge
              address={seller.walletAddress}
              truncate="middle"
              showCopy
              explorerNetwork={explorerNetwork}
              className="text-xs"
            />
          </div>
          <EvidenceMetadataPanel
            cid={seller.cid}
            fileName={seller.fileName}
            checksum={seller.checksum}
            mimeType={seller.mimeType}
            uploadedAt={seller.uploadedAt}
            videoSrc={seller.videoSrc}
          />
        </div>
      </div>

      {/* Optional resolution panel (action buttons, tx status, etc.) */}
      {resolutionPanel && (
        <div className="mt-2" aria-label="Resolution controls">
          {resolutionPanel}
        </div>
      )}
    </section>
  );
}

export default MediatorEvidenceReview;
