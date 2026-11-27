/**
 * Tests for MediatorEvidenceReview (#488)
 *
 * Covers: context header rendering, both evidence columns, resolution panel
 * slot, accessibility labels, and responsive layout attributes.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MediatorEvidenceReview } from "../MediatorEvidenceReview";

// Minimal mock for WalletAddressBadge — avoids pulling in Stellar SDK
jest.mock("@/components/ui/WalletAddressBadge", () => ({
  WalletAddressBadge: ({ address }: { address: string }) => (
    <span data-testid="wallet-badge">{address}</span>
  ),
}));

// Minimal mock for EvidenceMetadataPanel — isolates this test from #486 impl
jest.mock("@/components/ui/EvidenceMetadataPanel", () => ({
  EvidenceMetadataPanel: ({ cid }: { cid: string }) => (
    <div data-testid="evidence-panel" data-cid={cid} />
  ),
}));

jest.mock("@/components/ui/Badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const BUYER: Parameters<typeof MediatorEvidenceReview>[0]["buyer"] = {
  partyLabel: "Buyer",
  walletAddress: "GBUYERADDRESS0000000000000000000000000000000000000001",
  cid: "QmBuyerCid111111111111111111111111111111111111111",
  mimeType: "video/mp4",
  uploadedAt: "2026-05-14T08:00:00.000Z",
};

const SELLER: Parameters<typeof MediatorEvidenceReview>[0]["seller"] = {
  partyLabel: "Driver / Seller",
  walletAddress: "GSELLERADDRESS000000000000000000000000000000000001",
  cid: "QmSellerCid222222222222222222222222222222222222222",
  mimeType: "video/webm",
  uploadedAt: "2026-05-14T09:30:00.000Z",
};

const BASE_PROPS = {
  disputeId: "42",
  tradeId: "TRD-999",
  tradeAmount: "50,000 cNGN",
  buyer: BUYER,
  seller: SELLER,
};

describe("MediatorEvidenceReview", () => {
  it("renders the context header with dispute ID, trade ID, and amount", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("TRD-999")).toBeInTheDocument();
    expect(screen.getByText("50,000 cNGN")).toBeInTheDocument();
  });

  it("renders buyer and seller wallet addresses in the context header", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    const badges = screen.getAllByTestId("wallet-badge");
    const addrs = badges.map((b) => b.textContent);
    expect(addrs).toContain(BUYER.walletAddress);
    expect(addrs).toContain(SELLER.walletAddress);
  });

  it("renders two EvidenceMetadataPanel instances with correct CIDs", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    const panels = screen.getAllByTestId("evidence-panel");
    expect(panels).toHaveLength(2);
    const cids = panels.map((p) => p.getAttribute("data-cid"));
    expect(cids).toContain(BUYER.cid);
    expect(cids).toContain(SELLER.cid);
  });

  it("renders buyer and seller evidence column labels", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    expect(screen.getByText("Buyer Evidence")).toBeInTheDocument();
    expect(screen.getByText("Seller / Driver Evidence")).toBeInTheDocument();
  });

  it("renders an optional resolution panel slot", () => {
    render(
      <MediatorEvidenceReview
        {...BASE_PROPS}
        resolutionPanel={<div data-testid="resolution-panel">Resolve</div>}
      />,
    );
    expect(screen.getByTestId("resolution-panel")).toBeInTheDocument();
  });

  it("omits resolution panel when not provided", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    expect(screen.queryByTestId("resolution-panel")).not.toBeInTheDocument();
  });

  it("wraps the section with a descriptive aria-label", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    expect(
      screen.getByRole("region", {
        name: /mediator evidence review for dispute 42/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders evidence comparison grid with aria-label", () => {
    render(<MediatorEvidenceReview {...BASE_PROPS} />);
    expect(
      screen.getByRole("generic", { name: /evidence comparison/i }),
    ).toBeInTheDocument();
  });
});
