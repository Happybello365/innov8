/**
 * Tests for LossRatioExplanation (#489)
 *
 * Covers: percentage display, amount computation, bar meter accessibility,
 * footnote text, and edge cases (zero splits, 50/50).
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { LossRatioExplanation } from "../LossRatioExplanation";

describe("LossRatioExplanation", () => {
  it("renders buyer and seller percentages", () => {
    render(
      <LossRatioExplanation buyerLossBps={3000} sellerLossBps={7000} />,
    );
    // 3000 bps → 30.00%
    expect(screen.getByText("30.00")).toBeInTheDocument();
    // 7000 bps → 70.00%
    expect(screen.getByText("70.00")).toBeInTheDocument();
  });

  it("renders computed worst-case amounts when totalAmount is provided", () => {
    render(
      <LossRatioExplanation
        buyerLossBps={3000}
        sellerLossBps={7000}
        totalAmount={10000}
        amountUnit="cNGN"
      />,
    );
    // Buyer max loss: 30% of 10 000 = 3 000.00
    expect(screen.getByText(/3,000\.00/)).toBeInTheDocument();
    // Seller max loss: 70% of 10 000 = 7 000.00
    expect(screen.getByText(/7,000\.00/)).toBeInTheDocument();
  });

  it("omits amount rows when totalAmount is not provided", () => {
    render(
      <LossRatioExplanation buyerLossBps={3000} sellerLossBps={7000} />,
    );
    expect(screen.queryByText(/Max loss/)).not.toBeInTheDocument();
  });

  it("renders bar meter elements with aria attributes", () => {
    render(
      <LossRatioExplanation buyerLossBps={3000} sellerLossBps={7000} />,
    );
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(2);

    const buyerMeter = meters.find((m) =>
      m.getAttribute("aria-label")?.toLowerCase().includes("buyer"),
    );
    expect(buyerMeter).toBeTruthy();
    expect(buyerMeter).toHaveAttribute("aria-valuenow", "30");
    expect(buyerMeter).toHaveAttribute("aria-valuemin", "0");
    expect(buyerMeter).toHaveAttribute("aria-valuemax", "100");
    expect(buyerMeter).toHaveAttribute("aria-valuetext", "30.00%");

    const sellerMeter = meters.find((m) =>
      m.getAttribute("aria-label")?.toLowerCase().includes("seller"),
    );
    expect(sellerMeter).toHaveAttribute("aria-valuenow", "70");
  });

  it("renders an accessible section with aria-label", () => {
    render(
      <LossRatioExplanation buyerLossBps={3000} sellerLossBps={7000} />,
    );
    expect(
      screen.getByRole("region", { name: /loss-sharing ratio explanation/i }),
    ).toBeInTheDocument();
  });

  it("renders the disclaimer footnote", () => {
    render(
      <LossRatioExplanation buyerLossBps={3000} sellerLossBps={7000} />,
    );
    expect(
      screen.getByText(/these ratios only apply/i),
    ).toBeInTheDocument();
  });

  it("renders with custom party labels", () => {
    render(
      <LossRatioExplanation
        buyerLossBps={5000}
        sellerLossBps={5000}
        buyerLabel="Acme Buyer"
        sellerLabel="Delta Seller"
      />,
    );
    expect(screen.getByText("Acme Buyer")).toBeInTheDocument();
    expect(screen.getByText("Delta Seller")).toBeInTheDocument();
  });

  it("renders an equal 50/50 split correctly", () => {
    render(
      <LossRatioExplanation buyerLossBps={5000} sellerLossBps={5000} />,
    );
    const values = screen.getAllByText("50.00");
    expect(values.length).toBeGreaterThanOrEqual(2);
  });

  it("renders bar label for seller area title", () => {
    render(
      <LossRatioExplanation buyerLossBps={3000} sellerLossBps={7000} />,
    );
    expect(screen.getByText("Loss-Sharing Ratio")).toBeInTheDocument();
  });

  it("uses the custom amountUnit in the amount display", () => {
    render(
      <LossRatioExplanation
        buyerLossBps={5000}
        sellerLossBps={5000}
        totalAmount={1000}
        amountUnit="USDC"
      />,
    );
    expect(screen.getAllByText("USDC").length).toBeGreaterThanOrEqual(2);
  });
});
