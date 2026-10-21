import apiClient from './client';

export interface ReputationHistoryPoint {
  score: number;
  recordedAt: string;
}

export const reputationApi = {
  /** Reputation score history for the signed-in user (backend endpoint from #28). */
  async getMyReputationHistory(): Promise<ReputationHistoryPoint[]> {
    const response = await apiClient.get('/users/me/reputation/history');
    const data = response.data;
    return Array.isArray(data) ? data : data?.history ?? [];
  },
};
