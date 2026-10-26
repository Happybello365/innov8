import { request } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalContributionItem {
  id: number;
  amountUsdc: string;
  txHash: string;
  createdAt: string;
}

export interface GoalContributionsPage {
  goalId: string;
  data: GoalContributionItem[];
  /** Cursor for the next page; `null` when there are no more results. */
  nextCursor: number | null;
}

export interface GoalAnalyticsSummary {
  goalId: string;
  targetAmountUsdc: string;
  currentAmountUsdc: string;
  percentageComplete: number;
  daysRemaining: number;
  deadline: string;
  status: string;
  vaultBalance: string;
  isOnTrack: boolean;
}

export interface GoalsAnalyticsResponse {
  walletAddress: string;
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTargetAmount: string;
  totalCurrentAmount: string;
  overallProgressPercentage: number;
  goals: GoalAnalyticsSummary[];
  timestamp: string;
}

// ─── Goals API ────────────────────────────────────────────────────────────────

export const goalsApi = {
  /**
   * Fetch goals analytics for the authenticated user.
   * Returns overall goal list with progression metrics.
   */
  async getAnalytics(token: string): Promise<GoalsAnalyticsResponse> {
    return request<GoalsAnalyticsResponse>("/goals", { token });
  },

  /**
   * Fetch cursor-paginated contribution history for a savings goal.
   *
   * @param token  - Auth JWT
   * @param goalId - Goal ID to fetch contributions for
   * @param opts   - Optional cursor / limit for pagination
   */
  async getContributions(
    token: string,
    goalId: string,
    opts: { cursor?: number; limit?: number } = {},
  ): Promise<GoalContributionsPage> {
    const params = new URLSearchParams();
    if (opts.cursor != null) params.set("cursor", String(opts.cursor));
    if (opts.limit != null) params.set("limit", String(opts.limit));

    const query = params.toString() ? `?${params.toString()}` : "";
    const endpoint = `/goals/${encodeURIComponent(goalId)}/contributions${query}`;

    return request<GoalContributionsPage>(endpoint, { token });
  },
};
