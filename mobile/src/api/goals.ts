import apiClient from './client';

export interface GoalSummary {
  goalId: string;
  targetAmountUsdc: string;
  currentAmountUsdc: string;
  percentageComplete: number;
  status: string;
  deadline: string;
}

export interface GoalsAnalytics {
  totalGoals: number;
  goals: GoalSummary[];
}

export interface GoalContribution {
  id: string;
  amountUsdc: string;
  createdAt: string;
  txHash?: string | null;
}

export const goalsApi = {
  async listGoals(): Promise<GoalsAnalytics> {
    const response = await apiClient.get('/goals');
    return response.data;
  },

  /** Contribution history for a single goal (backend endpoint from #29). */
  async getContributionHistory(goalId: string): Promise<GoalContribution[]> {
    const response = await apiClient.get(`/goals/${encodeURIComponent(goalId)}/contributions`);
    const data = response.data;
    return Array.isArray(data) ? data : data?.contributions ?? [];
  },
};
