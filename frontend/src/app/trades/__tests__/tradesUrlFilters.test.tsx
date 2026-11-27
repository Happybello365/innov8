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

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/trades",
  useSearchParams: () => mockSearchParams,
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

describe("TradesPage — Advanced URL Filters & Pagination (#492)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
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

  it("reads initial filter and page from URL parameters", async () => {
    mockSearchParams = new URLSearchParams("status=pending&page=2");
    mockTradesList.mockResolvedValueOnce({
      items: [],
      pagination: { page: 2, limit: 100, total: 0, totalPages: 2 },
    } as any);

    render(<TradesPage />);

    await waitFor(() => {
      expect(mockTradesList).toHaveBeenCalledWith(
        "mock-token",
        expect.objectContaining({
          status: "pending",
          page: 2,
        }),
      );
    });
  });

  it("falls back to default 'all' filter and page 1 on invalid query parameters", async () => {
    mockSearchParams = new URLSearchParams("status=invalidStatus&page=-99");

    render(<TradesPage />);

    await waitFor(() => {
      expect(mockTradesList).toHaveBeenCalledWith(
        "mock-token",
        expect.objectContaining({
          status: undefined, // "all" translates to undefined for api.trades.list
          page: 1,
        }),
      );
    });
  });

  it("updates URL parameters when selecting a different filter tab", async () => {
    render(<TradesPage />);

    await waitFor(() => expect(mockTradesList).toHaveBeenCalled());

    const activeFilterBtn = screen.getByTestId("filter-active");
    fireEvent.click(activeFilterBtn);

    expect(mockReplace).toHaveBeenCalledWith("/trades?status=active", { scroll: false });
  });

  it("updates URL parameters when navigating pagination", async () => {
    mockTradesList.mockResolvedValueOnce({
      items: [
        {
          tradeId: "TRD-1",
          buyerAddress: "GBUYER",
          sellerAddress: "GSELLER",
          amountCngn: "1000",
          status: "completed",
          createdAt: "2026-03-24T00:00:00Z",
        },
      ],
      pagination: { page: 1, limit: 100, total: 200, totalPages: 2 },
    } as any);

    render(<TradesPage />);

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument();
    });

    const nextBtn = screen.getByText("Next");
    fireEvent.click(nextBtn);

    expect(mockReplace).toHaveBeenCalledWith("/trades?page=2", { scroll: false });
  });
});
