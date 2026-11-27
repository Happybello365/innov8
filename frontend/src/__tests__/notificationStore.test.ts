import { useNotificationStore, Notification } from '../stores/notificationStore';

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n-1',
  title: 'Title',
  message: 'Message',
  type: 'info',
  read: false,
  createdAt: '2026-06-28T00:00:00Z',
  ...overrides,
});

describe('Notification Store', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
    });
    jest.clearAllMocks();
  });

  // ─── Initial state ───────────────────────────────────────────────────────

  describe('Initial State', () => {
    it('should have correct initial values', () => {
      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });

  // ─── fetch ───────────────────────────────────────────────────────────────

  describe('fetch', () => {
    it('sets isLoading true during fetch then false on success', async () => {
      const mockNotifications: Notification[] = [
        makeNotification({ id: 'n-1', read: false }),
        makeNotification({ id: 'n-2', read: true }),
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ notifications: mockNotifications }),
      } as unknown as Response);

      const store = useNotificationStore.getState();
      const fetchPromise = store.fetch();

      expect(useNotificationStore.getState().isLoading).toBe(true);
      await fetchPromise;

      const state = useNotificationStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.notifications).toEqual(mockNotifications);
      expect(state.unreadCount).toBe(1);
    });

    it('accepts a top-level array from the API (no .notifications wrapper)', async () => {
      const mockNotifications: Notification[] = [
        makeNotification({ id: 'n-1', read: false }),
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockNotifications),
      } as unknown as Response);

      await useNotificationStore.getState().fetch();

      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual(mockNotifications);
      expect(state.unreadCount).toBe(1);
    });

    it('falls back to mock data when fetch rejects', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await useNotificationStore.getState().fetch();

      const state = useNotificationStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.notifications.length).toBeGreaterThan(0);
      expect(state.unreadCount).toBe(
        state.notifications.filter(n => !n.read).length,
      );
    });

    it('falls back to mock data when response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response);

      await useNotificationStore.getState().fetch();

      const state = useNotificationStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.notifications.length).toBeGreaterThan(0);
    });

    it('derives unreadCount correctly from API notifications', async () => {
      const notifications: Notification[] = [
        makeNotification({ id: '1', read: false }),
        makeNotification({ id: '2', read: false }),
        makeNotification({ id: '3', read: true }),
        makeNotification({ id: '4', read: false }),
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ notifications }),
      } as unknown as Response);

      await useNotificationStore.getState().fetch();

      expect(useNotificationStore.getState().unreadCount).toBe(3);
    });
  });

  // ─── markRead ─────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('marks one notification read and decrements unreadCount', async () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: '1', read: false }),
          makeNotification({ id: '2', read: false }),
        ],
        unreadCount: 2,
      });

      global.fetch = jest.fn().mockResolvedValue({ ok: true } as unknown as Response);

      await useNotificationStore.getState().markRead('1');

      const state = useNotificationStore.getState();
      expect(state.notifications[0].read).toBe(true);
      expect(state.notifications[1].read).toBe(false);
      expect(state.unreadCount).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications/1/read', { method: 'PATCH' });
    });

    it('does not decrement unreadCount when marking an already-read notification', async () => {
      useNotificationStore.setState({
        notifications: [makeNotification({ id: '1', read: true })],
        unreadCount: 0,
      });

      global.fetch = jest.fn().mockResolvedValue({ ok: true } as unknown as Response);

      await useNotificationStore.getState().markRead('1');

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('still updates local state even when the PATCH request fails', async () => {
      useNotificationStore.setState({
        notifications: [makeNotification({ id: '1', read: false })],
        unreadCount: 1,
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await useNotificationStore.getState().markRead('1');

      const state = useNotificationStore.getState();
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  // ─── markAllRead ──────────────────────────────────────────────────────────

  describe('markAllRead', () => {
    it('marks all notifications read and resets unreadCount to 0', async () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: '1', read: false }),
          makeNotification({ id: '2', read: false }),
        ],
        unreadCount: 2,
      });

      global.fetch = jest.fn().mockResolvedValue({ ok: true } as unknown as Response);

      await useNotificationStore.getState().markAllRead();

      const state = useNotificationStore.getState();
      expect(state.notifications.every(n => n.read)).toBe(true);
      expect(state.unreadCount).toBe(0);
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications/read', { method: 'PATCH' });
    });

    it('still clears local read state even when PATCH fails', async () => {
      useNotificationStore.setState({
        notifications: [makeNotification({ id: '1', read: false })],
        unreadCount: 1,
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await useNotificationStore.getState().markAllRead();

      const state = useNotificationStore.getState();
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('handles an empty notifications list without error', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as unknown as Response);

      await useNotificationStore.getState().markAllRead();

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  // ─── addNotification ──────────────────────────────────────────────────────

  describe('addNotification', () => {
    it('prepends a new notification and updates unreadCount', () => {
      useNotificationStore.setState({
        notifications: [makeNotification({ id: '1', read: true })],
        unreadCount: 0,
      });

      const newNotification = makeNotification({ id: '2', read: false, type: 'warning' });

      useNotificationStore.getState().addNotification(newNotification);

      const state = useNotificationStore.getState();
      expect(state.notifications[0]).toEqual(newNotification);
      expect(state.notifications.length).toBe(2);
      expect(state.unreadCount).toBe(1);
    });

    it('does not increment unreadCount when adding an already-read notification', () => {
      useNotificationStore.setState({ notifications: [], unreadCount: 0 });

      useNotificationStore.getState().addNotification(
        makeNotification({ id: '1', read: true }),
      );

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  // ─── Store reset (logout) ─────────────────────────────────────────────────

  describe('store reset on logout', () => {
    it('clears all notifications and unreadCount when state is reset', () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: '1', read: false }),
          makeNotification({ id: '2', read: false }),
        ],
        unreadCount: 2,
        isLoading: false,
      });

      // Simulate logout by resetting to initial state
      useNotificationStore.setState({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });
  });
});
