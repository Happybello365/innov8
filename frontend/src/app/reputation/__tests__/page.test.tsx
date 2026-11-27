import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import ReputationPage from "../page";

// ── Mock next/navigation ──────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Mock useAuth ──────────────────────────────────────────────────────────────

jest.mock("@/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "@/hooks/useAuth";
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// ── Mock API ──────────────────────────────────────────────────────────────────

jest.mock("@/lib/api", () => ({
  api: {
    reputation: {
      getMyReputation: jest.fn(),
    },
  },
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, message: string, data?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  },
}));

import { api } from "@/lib/api";
const mockedGetMyReputation = api.reputation
  .getMyReputation as jest.MockedFunction<
  typeof api.reputation.getMyReputation
>;

// ── Mock UI components not under test ─────────────────────────────────────────

jest.mock("@/components/ui/RepScoreRing", () => ({
  RepScoreRing: () => <div data-testid="rep-score-ring" />,
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

jest.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const authenticatedAuth = {
  token: "test-token",
  isAuthenticated: true,
  isLoading: false,
  address: "GABCDEFGHIJKLMNOPXYZ",
  isWalletConnected: true,
  isWalletDetected: true,
  connectWallet: jest.fn(),
  authenticate: jest.fn(),
  logout: jest.fn(),
};

/** A full reputation response with trade history. */
const reputationWithHistory = {
  trustScore: 85,
  totalTrades: 5,
  completedTrades: 4,
  disputedTrades: 1,
  successRate: 80,
  history: [
    {
      id: "evt-1",
      event: "Trade completed",
      impact: 10,
      impactLabel: "+10",
      timestamp: "2024-06-01T12:00:00.000Z",
      type: "trade_completed" as const,
    },
  ],
};

/** A reputation response for a brand-new user who has made zero trades. */
const reputationEmpty = {
  trustScore: 0,
  totalTrades: 0,
  completedTrades: 0,
  disputedTrades: 0,
  successRate: 0,
  history: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ReputationPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue(authenticatedAuth as any);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe("empty state (zero trades)", () => {
    test("shows empty state when totalTrades === 0 and history is empty", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationEmpty);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("reputation-empty-state"),
        ).toBeInTheDocument();
      });
    });

    test("shows 'Build Your Reputation' heading in empty state", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationEmpty);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /build your reputation/i }),
        ).toBeInTheDocument();
      });
    });

    test("renders the 'Start Your First Trade' CTA button in empty state", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationEmpty);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("start-trading-cta"),
        ).toBeInTheDocument();
      });
    });

    test("CTA navigates to /trade/new", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationEmpty);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        const cta = screen.getByTestId("start-trading-cta");
        cta.click();
      });

      expect(mockPush).toHaveBeenCalledWith("/trade/new");
    });

    test("does NOT render the RepScoreRing in empty state", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationEmpty);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("reputation-empty-state"),
        ).toBeInTheDocument();
      });

      expect(screen.queryByTestId("rep-score-ring")).not.toBeInTheDocument();
    });
  });

  // ── Existing history ───────────────────────────────────────────────────────

  describe("existing history view", () => {
    test("renders the RepScoreRing when user has trades", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationWithHistory);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("rep-score-ring")).toBeInTheDocument();
      });
    });

    test("does NOT show empty state when user has trades", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationWithHistory);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("rep-score-ring")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("reputation-empty-state"),
      ).not.toBeInTheDocument();
    });

    test("renders the trust score value", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationWithHistory);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("85")).toBeInTheDocument();
      });
    });

    test("renders the Trust History section heading", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationWithHistory);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /trust history/i }),
        ).toBeInTheDocument();
      });
    });

    test("renders history events", async () => {
      mockedGetMyReputation.mockResolvedValue(reputationWithHistory);

      await act(async () => {
        render(<ReputationPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("Trade completed")).toBeInTheDocument();
      });
    });
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────

  describe("unauthenticated", () => {
    test("shows Connect Wallet prompt when not authenticated", () => {
      mockedUseAuth.mockReturnValue({
        ...authenticatedAuth,
        isAuthenticated: false,
        isLoading: false,
        token: null,
      } as any);

      render(<ReputationPage />);

      expect(
        screen.getByRole("heading", { name: /connect wallet/i }),
      ).toBeInTheDocument();
    });
  });
});
