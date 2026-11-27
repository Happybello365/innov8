import { render, screen, fireEvent, within } from "@testing-library/react";
import { TradeNotFoundState } from "../TradeNotFoundState";
import { useCachedTrades } from "@/hooks/useCachedTrades";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/hooks/useCachedTrades", () => ({
  useCachedTrades: jest.fn(),
}));

const mockUseCachedTrades = useCachedTrades as jest.Mock;

function trade(id: string, status = "ACTIVE") {
  return { tradeId: id, status } as never;
}

describe("TradeNotFoundState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCachedTrades.mockReturnValue({
      data: { items: [trade("t-1"), trade("t-2", "SETTLED")], pagination: {} },
      isLoading: false,
      error: null,
    });
  });

  it("explains the missing ID and echoes it safely", () => {
    render(<TradeNotFoundState tradeId="missing-123" />);

    expect(screen.getByRole("heading", { name: "Trade not found" })).toBeInTheDocument();
    expect(screen.getByText("missing-123")).toBeInTheDocument();
  });

  it("requests a small recent-trades list", () => {
    render(<TradeNotFoundState tradeId="x" />);
    expect(mockUseCachedTrades).toHaveBeenCalledWith({ limit: 5 });
  });

  it("lists recent trades as links to their detail pages", () => {
    render(<TradeNotFoundState tradeId="x" />);

    const link = screen.getByRole("link", { name: "t-1" });
    expect(link).toHaveAttribute("href", "/trades/t-1");
    expect(screen.getByText("SETTLED")).toBeInTheDocument();
  });

  it("shows an empty message when there are no recent trades", () => {
    mockUseCachedTrades.mockReturnValue({ data: { items: [] }, isLoading: false, error: null });
    render(<TradeNotFoundState tradeId="x" />);
    expect(screen.getByText("No recent trades to show.")).toBeInTheDocument();
  });

  it("shows a loading message while recent trades load", () => {
    mockUseCachedTrades.mockReturnValue({ data: null, isLoading: true, error: null });
    render(<TradeNotFoundState tradeId="x" />);
    expect(screen.getByText("Loading recent trades…")).toBeInTheDocument();
  });

  it("shows an error message if recent trades fail to load", () => {
    mockUseCachedTrades.mockReturnValue({ data: null, isLoading: false, error: "boom" });
    render(<TradeNotFoundState tradeId="x" />);
    expect(screen.getByText("Couldn't load recent trades.")).toBeInTheDocument();
  });

  it("navigates to the trade when a valid ID is searched", () => {
    render(<TradeNotFoundState tradeId="x" />);

    fireEvent.change(screen.getByLabelText("Search by trade ID"), { target: { value: "  abc-123  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(pushMock).toHaveBeenCalledWith("/trades/abc-123");
  });

  it("rejects an invalid ID without navigating", () => {
    render(<TradeNotFoundState tradeId="x" />);

    const input = screen.getByLabelText("Search by trade ID");
    fireEvent.change(input, { target: { value: "../../admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(pushMock).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a valid trade ID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("rejects an empty search", () => {
    render(<TradeNotFoundState tradeId="x" />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("offers recovery links to the trades list and help", () => {
    render(<TradeNotFoundState tradeId="x" />);
    const nav = screen.getByRole("navigation", { name: "Trade recovery actions" });
    expect(within(nav).getByRole("link", { name: "View all trades" })).toHaveAttribute("href", "/trades");
    expect(within(nav).getByRole("link", { name: "Get help" })).toHaveAttribute("href", "/help");
  });
});
