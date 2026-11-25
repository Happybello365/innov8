import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TradesPage from "../page";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

jest.mock("@/hooks/useAuth");
jest.mock("@/components/AnalyticsProvider", () => ({
  useAnalytics: () => ({
    trackFunnelStep: jest.fn(),
    trackApiFailure: jest.fn(),
  }),
}));
jest.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    addToast: jest.fn(),
  }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/trades",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/api", () => ({
  api: {
    trades: {
      list: jest.fn(),
    },
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/components/ui/VirtualizedList", () => ({
  VirtualizedList: ({ items, renderItem }: any) => (
    <div data-testid="virtualized-list">
      {items.map((item: any, i: number) => renderItem(item, i))}
    </div>
  ),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockTradesList = api.trades.list as jest.MockedFunction<typeof api.trades.list>;

describe("TradesPage — Density Preference Persistence (#493)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({
      token: "mock-token",
      isAuthenticated: true,
    } as any);
    mockTradesList.mockResolvedValue({
      items: [
        {
          tradeId: "TRD-12345678",
          buyerAddress: "GBUYER",
          sellerAddress: "GSELLER",
          amountCngn: "5000",
          status: "active",
          createdAt: "2026-03-24T00:00:00Z",
        },
      ],
      pagination: {
        page: 1,
        limit: 100,
        total: 1,
        totalPages: 1,
      },
    } as any);
  });

  it("defaults to comfortable density when no preference is saved", async () => {
    render(<TradesPage />);

    await waitFor(() => expect(mockTradesList).toHaveBeenCalled());

    const comfortableBtn = screen.getByTestId("density-comfortable-btn");
    expect(comfortableBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("loads compact density preference from localStorage on mount", async () => {
    localStorage.setItem("innov8-trade-list-density", "compact");

    render(<TradesPage />);

    await waitFor(() => expect(mockTradesList).toHaveBeenCalled());

    const compactBtn = screen.getByTestId("density-compact-btn");
    expect(compactBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("persists density preference changes to localStorage", async () => {
    render(<TradesPage />);

    await waitFor(() => expect(mockTradesList).toHaveBeenCalled());

    const compactBtn = screen.getByTestId("density-compact-btn");
    fireEvent.click(compactBtn);

    expect(compactBtn).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("innov8-trade-list-density")).toBe("compact");

    const comfortableBtn = screen.getByTestId("density-comfortable-btn");
    fireEvent.click(comfortableBtn);

    expect(comfortableBtn).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("innov8-trade-list-density")).toBe("comfortable");
  });
});
