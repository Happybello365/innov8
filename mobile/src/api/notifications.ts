import apiClient from './client';

export interface InAppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  metadata: Record<string, string> | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: InAppNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

export const notificationsApi = {
  async listNotifications(params?: {
    unreadOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<NotificationListResult> {
    const response = await apiClient.get('/notifications', { params });
    return response.data;
  },

  async markRead(id: number): Promise<void> {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<void> {
    await apiClient.post('/notifications/read-all');
  },
};

/**
 * Quiet hours (issue #260; backend #27). Times are `HH:MM` wall-clock in
 * `timezone` (IANA); the window may wrap midnight (e.g. 22:00 → 07:00).
 */
export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

export const quietHoursApi = {
  async getQuietHours(): Promise<QuietHours | null> {
    const response = await apiClient.get('/notifications/quiet-hours');
    return response.data?.quietHours ?? null;
  },

  async updateQuietHours(quietHours: QuietHours): Promise<QuietHours> {
    const response = await apiClient.put('/notifications/quiet-hours', quietHours);
    return response.data.quietHours;
  },
};
