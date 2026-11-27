import { renderHook, act, waitFor } from "@testing-library/react";
import { usePathPaymentQuote, QUOTE_TTL_MS } from "../usePathPaymentQuote";
import { walletApi } from "@/lib/api/wallet";

jest.mock("@/lib/api/wallet", () => ({
  walletApi: {
    getPathPaymentQuote: jest.fn(),
  },
}));

const mockGetQuote = walletApi.getPathPaymentQuote as jest.Mock;

const MOCK_QUOTE = {
  source_amount: "225000",
  source_asset_type: "credit_alphanum4",
  source_asset_code: "NGN",
  destination_amount: "224550.00",
  destination_asset_type: "credit_alphanum4",
  destination_asset_code: "cNGN",
  path: [],
};

const MOCK_QUOTE_WITH_PATH = {
  ...MOCK_QUOTE,
  path: [{ asset_code: "USDC", asset_issuer: "GA5Z..." }],
};

describe("usePathPaymentQuote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("idle state", () => {
    it("starts idle when sourceAmountNgn is empty", () => {
      const { result } = renderHook(() =>
        usePathPaymentQuote("", "mock-token"),
      );

      expect(result.current.status).toBe("idle");
      expect(result.current.quote).toBeNull();
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.secondsRemaining).toBe(0);
    });

    it("starts idle when sourceAmountNgn is '0'", () => {
      const { result } = renderHook(() =>
        usePathPaymentQuote("0", "mock-token"),
      );

      expect(result.current.status).toBe("idle");
    });

    it("starts idle when token is null", () => {
      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", null),
      );

      expect(result.current.status).toBe("idle");
      expect(mockGetQuote).not.toHaveBeenCalled();
    });

    it("does not call the API when idle", () => {
      renderHook(() => usePathPaymentQuote("", "mock-token"));

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(mockGetQuote).not.toHaveBeenCalled();
    });
  });

  describe("successful quote fetch", () => {
    it("transitions to loading then fresh after debounce", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      // Before debounce fires
      expect(result.current.status).toBe("idle");

      // Advance past debounce (500 ms)
      act(() => {
        jest.advanceTimersByTime(600);
      });

      // Should be loading while API call is in-flight
      await waitFor(() => {
        expect(result.current.status).toBe("fresh");
      });

      expect(result.current.quote).toEqual(MOCK_QUOTE);
      expect(result.current.errorMessage).toBeNull();
    });

    it("populates quote with best route", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE, MOCK_QUOTE_WITH_PATH] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });

      await waitFor(() => expect(result.current.status).toBe("fresh"));

      // Always picks routes[0]
      expect(result.current.quote).toEqual(MOCK_QUOTE);
    });

    it("sets quote to null when routes array is empty", async () => {
      mockGetQuote.mockResolvedValue({ routes: [] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });

      await waitFor(() => expect(result.current.status).toBe("fresh"));
      expect(result.current.quote).toBeNull();
    });

    it("calls the API with the correct parameters", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      renderHook(() => usePathPaymentQuote("225000", "mock-token"));

      act(() => { jest.advanceTimersByTime(600); });

      await waitFor(() => expect(mockGetQuote).toHaveBeenCalledTimes(1));

      expect(mockGetQuote).toHaveBeenCalledWith("225000", "NGN", undefined);
    });
  });

  describe("debouncing", () => {
    it("only calls the API once after rapid amount changes", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { rerender } = renderHook(
        ({ amount }: { amount: string }) =>
          usePathPaymentQuote(amount, "mock-token"),
        { initialProps: { amount: "100000" } },
      );

      rerender({ amount: "150000" });
      rerender({ amount: "200000" });
      rerender({ amount: "225000" });

      act(() => { jest.advanceTimersByTime(600); });

      await waitFor(() => expect(mockGetQuote).toHaveBeenCalledTimes(1));
      expect(mockGetQuote).toHaveBeenCalledWith("225000", "NGN", undefined);
    });

    it("fires a new request when debounce completes after each pause", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { rerender } = renderHook(
        ({ amount }: { amount: string }) =>
          usePathPaymentQuote(amount, "mock-token"),
        { initialProps: { amount: "100000" } },
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(mockGetQuote).toHaveBeenCalledTimes(1));

      rerender({ amount: "200000" });
      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(mockGetQuote).toHaveBeenCalledTimes(2));
    });
  });

  describe("stale quote (TTL expiry)", () => {
    it("transitions to stale after QUOTE_TTL_MS", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(result.current.status).toBe("fresh"));

      // Advance past TTL
      act(() => { jest.advanceTimersByTime(QUOTE_TTL_MS + 1000); });

      expect(result.current.status).toBe("stale");
    });

    it("counts down secondsRemaining toward zero", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(result.current.status).toBe("fresh"));

      const initialSeconds = result.current.secondsRemaining;
      expect(initialSeconds).toBe(Math.ceil(QUOTE_TTL_MS / 1000));

      act(() => { jest.advanceTimersByTime(5000); });
      expect(result.current.secondsRemaining).toBeLessThan(initialSeconds);
    });

    it("sets secondsRemaining to 0 when stale", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(result.current.status).toBe("fresh"));

      act(() => { jest.advanceTimersByTime(QUOTE_TTL_MS + 2000); });

      expect(result.current.secondsRemaining).toBe(0);
      expect(result.current.status).toBe("stale");
    });
  });

  describe("refresh", () => {
    it("fires a new request immediately when refresh() is called", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(mockGetQuote).toHaveBeenCalledTimes(1));

      act(() => { result.current.refresh(); });

      await waitFor(() => expect(mockGetQuote).toHaveBeenCalledTimes(2));
    });

    it("resets status back to fresh after a successful refresh", async () => {
      mockGetQuote.mockResolvedValue({ routes: [MOCK_QUOTE] });

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(result.current.status).toBe("fresh"));

      // Let quote go stale
      act(() => { jest.advanceTimersByTime(QUOTE_TTL_MS + 1000); });
      expect(result.current.status).toBe("stale");

      // Refresh
      act(() => { result.current.refresh(); });
      await waitFor(() => expect(result.current.status).toBe("fresh"));
    });

    it("does not fire when amount is empty", () => {
      const { result } = renderHook(() =>
        usePathPaymentQuote("", "mock-token"),
      );

      act(() => { result.current.refresh(); });
      expect(mockGetQuote).not.toHaveBeenCalled();
    });

    it("does not fire when token is null", () => {
      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", null),
      );

      act(() => { result.current.refresh(); });
      expect(mockGetQuote).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("transitions to error status when API call fails", async () => {
      mockGetQuote.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.errorMessage).toBe("Network error");
      expect(result.current.quote).toBeNull();
    });

    it("sets a fallback error message for non-Error throws", async () => {
      mockGetQuote.mockRejectedValue("unexpected string error");

      const { result } = renderHook(() =>
        usePathPaymentQuote("225000", "mock-token"),
      );

      act(() => { jest.advanceTimersByTime(600); });

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.errorMessage).toBe("Failed to fetch quote");
    });

    it("resets error state to idle when amount is cleared", async () => {
      mockGetQuote.mockRejectedValue(new Error("Network error"));

      const { result, rerender } = renderHook(
        ({ amount }: { amount: string }) =>
          usePathPaymentQuote(amount, "mock-token"),
        { initialProps: { amount: "225000" } },
      );

      act(() => { jest.advanceTimersByTime(600); });
      await waitFor(() => expect(result.current.status).toBe("error"));

      rerender({ amount: "" });

      expect(result.current.status).toBe("idle");
      expect(result.current.errorMessage).toBeNull();
    });
  });
});
