import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversionPreview } from "../ConversionPreview";
import type { PathPaymentQuote } from "@/lib/api/types";

const MOCK_QUOTE: PathPaymentQuote = {
  source_amount: "225000",
  source_asset_type: "credit_alphanum4",
  source_asset_code: "NGN",
  destination_amount: "224550.00",
  destination_asset_type: "credit_alphanum4",
  destination_asset_code: "cNGN",
  path: [],
};

const MOCK_QUOTE_WITH_PATH: PathPaymentQuote = {
  ...MOCK_QUOTE,
  path: [
    { asset_code: "USDC", asset_issuer: "GA5Z..." },
    { asset_code: "XLM" },
  ],
};

function renderPreview(
  overrides: Partial<React.ComponentProps<typeof ConversionPreview>> = {},
) {
  const defaults: React.ComponentProps<typeof ConversionPreview> = {
    sourceAmountNgn: "225000",
    quote: MOCK_QUOTE,
    status: "fresh",
    errorMessage: null,
    secondsRemaining: 25,
    onRefresh: jest.fn(),
    ...overrides,
  };
  return render(<ConversionPreview {...defaults} />);
}

describe("ConversionPreview", () => {
  describe("idle state", () => {
    it("renders nothing when status is idle", () => {
      const { container } = renderPreview({ status: "idle", quote: null });
      expect(container.firstChild).toBeNull();
    });
  });

  describe("loading state", () => {
    it("renders the panel when status is loading", () => {
      renderPreview({ status: "loading", quote: null });
      expect(screen.getByTestId("conversion-preview")).toBeInTheDocument();
    });

    it("shows fetching message when loading and no quote yet", () => {
      renderPreview({ status: "loading", quote: null });
      expect(screen.getByText(/fetching best route/i)).toBeInTheDocument();
    });
  });

  describe("fresh quote", () => {
    it("renders the conversion preview panel", () => {
      renderPreview();
      expect(screen.getByTestId("conversion-preview")).toBeInTheDocument();
    });

    it("displays 'You send' label and source asset", () => {
      renderPreview();
      expect(screen.getByText(/you send/i)).toBeInTheDocument();
      expect(screen.getAllByText("NGN").length).toBeGreaterThan(0);
    });

    it("displays 'Recipient gets' label and destination asset", () => {
      renderPreview();
      expect(screen.getByText(/recipient gets/i)).toBeInTheDocument();
      expect(screen.getAllByText("cNGN").length).toBeGreaterThan(0);
    });

    it("shows path as Direct when path array is empty", () => {
      renderPreview({ quote: MOCK_QUOTE });
      expect(screen.getByText("Direct")).toBeInTheDocument();
    });

    it("shows path hop count when path has entries", () => {
      renderPreview({ quote: MOCK_QUOTE_WITH_PATH });
      expect(screen.getByText("2 hops")).toBeInTheDocument();
    });

    it("shows singular 'hop' for a single-hop path", () => {
      renderPreview({
        quote: { ...MOCK_QUOTE, path: [{ asset_code: "XLM" }] },
      });
      expect(screen.getByText("1 hop")).toBeInTheDocument();
    });

    it("shows estimated fee row", () => {
      renderPreview();
      expect(screen.getByText(/estimated fee/i)).toBeInTheDocument();
    });

    it("shows slippage row", () => {
      renderPreview();
      expect(screen.getByText(/slippage/i)).toBeInTheDocument();
    });

    it("shows fresh indicator dot", () => {
      renderPreview();
      expect(screen.getByTestId("quote-fresh-indicator")).toBeInTheDocument();
    });

    it("does not show stale banner when fresh with plenty of time", () => {
      renderPreview({ secondsRemaining: 25 });
      expect(screen.queryByTestId("stale-quote-banner")).not.toBeInTheDocument();
    });

    it("does not show countdown banner when >10 seconds remain", () => {
      renderPreview({ secondsRemaining: 20 });
      expect(
        screen.queryByTestId("quote-expiry-countdown"),
      ).not.toBeInTheDocument();
    });
  });

  describe("countdown banner (seconds ≤ 10)", () => {
    it("shows countdown when ≤10 seconds remain", () => {
      renderPreview({ secondsRemaining: 8 });
      expect(screen.getByTestId("quote-expiry-countdown")).toBeInTheDocument();
    });

    it("displays the seconds remaining in the countdown", () => {
      renderPreview({ secondsRemaining: 7 });
      expect(screen.getByText(/7s/)).toBeInTheDocument();
    });

    it("calls onRefresh when the refresh button is clicked in countdown", async () => {
      const onRefresh = jest.fn();
      renderPreview({ secondsRemaining: 5, onRefresh });

      await userEvent.click(screen.getByTestId("refresh-quote-btn"));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("stale quote warning (#491)", () => {
    it("shows stale banner when status is stale", () => {
      renderPreview({ status: "stale", secondsRemaining: 0 });
      expect(screen.getByTestId("stale-quote-banner")).toBeInTheDocument();
    });

    it("displays expiry warning message", () => {
      renderPreview({ status: "stale", secondsRemaining: 0 });
      expect(screen.getByText(/quote expired/i)).toBeInTheDocument();
    });

    it("renders a Refresh button in the stale banner", () => {
      renderPreview({ status: "stale", secondsRemaining: 0 });
      expect(screen.getByTestId("refresh-quote-btn")).toBeInTheDocument();
    });

    it("calls onRefresh when Refresh button is clicked", async () => {
      const onRefresh = jest.fn();
      renderPreview({ status: "stale", secondsRemaining: 0, onRefresh });

      await userEvent.click(screen.getByTestId("refresh-quote-btn"));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("shows stale indicator dot instead of fresh dot", () => {
      renderPreview({ status: "stale", secondsRemaining: 0 });
      const dot = screen.getByTestId("quote-fresh-indicator");
      // The stale dot carries a warning colour class
      expect(dot.className).toContain("bg-status-warning");
    });
  });

  describe("error state", () => {
    it("renders the panel when status is error", () => {
      renderPreview({ status: "error", quote: null, errorMessage: "Network error" });
      expect(screen.getByTestId("conversion-preview")).toBeInTheDocument();
    });

    it("displays the error message", () => {
      renderPreview({
        status: "error",
        quote: null,
        errorMessage: "Network error",
      });
      expect(screen.getByTestId("quote-error")).toHaveTextContent("Network error");
    });

    it("shows fallback message when errorMessage is null", () => {
      renderPreview({
        status: "error",
        quote: null,
        errorMessage: null,
      });
      expect(screen.getByTestId("quote-error")).toHaveTextContent(
        /could not fetch quote/i,
      );
    });
  });

  describe("native XLM asset labels", () => {
    it("renders 'XLM' for native source asset type", () => {
      renderPreview({
        quote: {
          ...MOCK_QUOTE,
          source_asset_type: "native",
          source_asset_code: undefined,
        },
      });
      expect(screen.getAllByText("XLM").length).toBeGreaterThan(0);
    });
  });
});
