import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GoalContributionChart } from "../GoalContributionChart";

// ─── Mock recharts ─────────────────────────────────────────────────────────────
// recharts uses ResizeObserver / SVG which jsdom doesn't support well.
// We stub the chart primitives so tests focus on logic, not SVG rendering.
jest.mock("recharts", () => {
  const OriginalModule = jest.requireActual<typeof import("recharts")>("recharts");
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    BarChart: ({
      children,
      "aria-label": ariaLabel,
    }: {
      children: React.ReactNode;
      "aria-label"?: string;
    }) => (
      <div data-testid="bar-chart" aria-label={ariaLabel}>
        {children}
      </div>
    ),
    Bar: () => <div data-testid="bar" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => <div data-testid="cart-grid" />,
    Tooltip: () => <div data-testid="tooltip" />,
  };
});

// ─── Mock goalsApi ─────────────────────────────────────────────────────────────
jest.mock("@/lib/api/goals", () => ({
  goalsApi: {
    getContributions: jest.fn(),
  },
}));

import { goalsApi } from "@/lib/api/goals";

const mockGetContributions = goalsApi.getContributions as jest.MockedFunction<
  typeof goalsApi.getContributions
>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GOAL_ID = "goal-abc-123";
const TOKEN = "test-jwt-token";

const makeContribution = (
  id: number,
  amountUsdc: string,
  createdAt: string,
) => ({
  id,
  amountUsdc,
  txHash: `0xhash${id}`,
  createdAt,
});

const emptyPage = {
  goalId: GOAL_ID,
  data: [],
  nextCursor: null,
};

const singlePage = {
  goalId: GOAL_ID,
  data: [makeContribution(1, "50.00", "2024-10-01T10:00:00.000Z")],
  nextCursor: null,
};

const multiPage = {
  goalId: GOAL_ID,
  data: [
    makeContribution(1, "50.00", "2024-10-01T10:00:00.000Z"),
    makeContribution(2, "75.50", "2024-10-15T10:00:00.000Z"),
    makeContribution(3, "100.00", "2024-11-01T10:00:00.000Z"),
  ],
  nextCursor: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GoalContributionChart", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  it("shows a loading skeleton while fetching", () => {
    // Never resolve
    mockGetContributions.mockReturnValue(new Promise(() => {}));
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    expect(screen.getByTestId("contribution-chart-loading")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Loading contribution history"),
    ).toBeInTheDocument();
  });

  it("has aria-busy=true on the loading skeleton", () => {
    mockGetContributions.mockReturnValue(new Promise(() => {}));
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    const skeleton = screen.getByTestId("contribution-chart-loading");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
  });

  // ── Zero contributions ──────────────────────────────────────────────────────

  it("renders empty state when there are no contributions", async () => {
    mockGetContributions.mockResolvedValue(emptyPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() =>
      expect(screen.getByTestId("contribution-chart-empty")).toBeInTheDocument(),
    );
    expect(screen.getByText("No contributions yet")).toBeInTheDocument();
  });

  it("provides an accessible label on the empty state", async () => {
    mockGetContributions.mockResolvedValue(emptyPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() =>
      expect(
        screen.getByLabelText("No contribution history yet"),
      ).toBeInTheDocument(),
    );
  });

  it("uses role=status on the empty state", async () => {
    mockGetContributions.mockResolvedValue(emptyPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-empty"));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // ── Single contribution ─────────────────────────────────────────────────────

  it("renders single-contribution state for exactly one contribution", async () => {
    mockGetContributions.mockResolvedValue(singlePage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() =>
      expect(screen.getByTestId("contribution-chart-single")).toBeInTheDocument(),
    );
  });

  it("shows the amount on the single-contribution card", async () => {
    mockGetContributions.mockResolvedValue(singlePage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-single"));
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });

  it("shows 'First Contribution' label on the single-contribution card", async () => {
    mockGetContributions.mockResolvedValue(singlePage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-single"));
    expect(screen.getByText("First Contribution")).toBeInTheDocument();
  });

  it("uses role=status on the single-contribution state", async () => {
    mockGetContributions.mockResolvedValue(singlePage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-single"));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // ── Multiple contributions ──────────────────────────────────────────────────

  it("renders the bar chart for multiple contributions", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() =>
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("shows the correct contribution count badge", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByText("3 contributions")).toBeInTheDocument();
  });

  it("shows singular 'contribution' for a single item count label", async () => {
    mockGetContributions.mockResolvedValue(singlePage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByText("1 contribution")).toBeInTheDocument();
  });

  it("renders the 'Contribution History' heading", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByText("Contribution History")).toBeInTheDocument();
  });

  // ── Accessible summary ──────────────────────────────────────────────────────

  it("renders a sr-only accessible summary table for multiple contributions", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));

    // The sr-only div should contain a table
    expect(
      screen.getByText("Goal Contribution History Summary"),
    ).toBeInTheDocument();
  });

  it("shows total contributions in the accessible summary", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByText(/3 contributions totalling/i)).toBeInTheDocument();
  });

  it("shows total of $225.50 for the multi-page fixture", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    // 50 + 75.50 + 100 = 225.50
    expect(screen.getByText(/\$225\.50/)).toBeInTheDocument();
  });

  it("renders an accessible summary table with headers Date and Amount", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Amount (USDC)")).toBeInTheDocument();
  });

  it("lists all contribution amounts in the accessible table", async () => {
    mockGetContributions.mockResolvedValue(multiPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByText("50.00")).toBeInTheDocument();
    expect(screen.getByText("75.50")).toBeInTheDocument();
    expect(screen.getByText("100.00")).toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it("shows an error message when the API call fails", async () => {
    mockGetContributions.mockRejectedValue(new Error("Network error"));
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() =>
      expect(screen.getByTestId("contribution-chart-error")).toBeInTheDocument(),
    );
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders a Retry button on error", async () => {
    mockGetContributions.mockRejectedValue(new Error("Oops"));
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-error"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("retries the API call when Retry is clicked", async () => {
    mockGetContributions
      .mockRejectedValueOnce(new Error("Fail"))
      .mockResolvedValueOnce(multiPage);

    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-error"));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument(),
    );
    expect(mockGetContributions).toHaveBeenCalledTimes(2);
  });

  it("uses role=alert on the error state", async () => {
    mockGetContributions.mockRejectedValue(new Error("Fail"));
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-error"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  // ── API call shape ──────────────────────────────────────────────────────────

  it("calls getContributions with goalId, token, and limit=100", async () => {
    mockGetContributions.mockResolvedValue(emptyPage);
    render(<GoalContributionChart goalId={GOAL_ID} token={TOKEN} />);
    await waitFor(() => screen.getByTestId("contribution-chart-empty"));
    expect(mockGetContributions).toHaveBeenCalledWith(TOKEN, GOAL_ID, {
      limit: 100,
    });
  });

  it("re-fetches when goalId prop changes", async () => {
    mockGetContributions.mockResolvedValue(emptyPage);
    const { rerender } = render(
      <GoalContributionChart goalId={GOAL_ID} token={TOKEN} />,
    );
    await waitFor(() => screen.getByTestId("contribution-chart-empty"));

    rerender(<GoalContributionChart goalId="new-goal-id" token={TOKEN} />);
    await waitFor(() =>
      expect(mockGetContributions).toHaveBeenCalledWith(TOKEN, "new-goal-id", {
        limit: 100,
      }),
    );
  });

  // ── className prop ──────────────────────────────────────────────────────────

  it("applies the className prop to the outer container", async () => {
    mockGetContributions.mockResolvedValue(emptyPage);
    render(
      <GoalContributionChart goalId={GOAL_ID} token={TOKEN} className="my-custom-class" />,
    );
    await waitFor(() => screen.getByTestId("contribution-chart-container"));
    expect(screen.getByTestId("contribution-chart-container")).toHaveClass(
      "my-custom-class",
    );
  });
});
