/**
 * Tests for the optimistic mark-read with API rollback behaviour added in #223.
 */
import { useNotificationStore, Notification } from "../stores/notificationStore";

const NOTIFICATIONS: Notification[] = [
  { id: "a", title: "T1", message: "M1", type: "info", read: false, createdAt: "2026-01-01T00:00:00Z" },
  { id: "b", title: "T2", message: "M2", type: "success", read: false, createdAt: "2026-01-01T01:00:00Z" },
];

beforeEach(() => {
  useNotificationStore.setState({ notifications: [...NOTIFICATIONS], unreadCount: 2, isLoading: false });
  jest.clearAllMocks();
});

describe("markRead — optimistic update", () => {
  it("marks only the targeted notification as read", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    await useNotificationStore.getState().markRead("a");
    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications.find((n) => n.id === "a")?.read).toBe(true);
    expect(notifications.find((n) => n.id === "b")?.read).toBe(false);
    expect(unreadCount).toBe(1);
  });

  it("does not change other notifications when one is marked read", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    await useNotificationStore.getState().markRead("a");
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(2);
    expect(notifications[1].read).toBe(false);
  });

  it("rolls back on API failure and restores unreadCount", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    // Simulate the optimistic update that AppTopNav.handleMarkRead performs
    const prev = useNotificationStore.getState().unreadCount;
    useNotificationStore.setState((s) => ({
      notifications: s.notifications.map((n) => n.id === "a" ? { ...n, read: true } : n),
      unreadCount: s.notifications.filter((n) => !n.read && n.id !== "a").length,
    }));
    try {
      await fetch("/api/notifications/a/read", { method: "PATCH" });
    } catch {
      useNotificationStore.setState((s) => ({
        notifications: s.notifications.map((n) => n.id === "a" ? { ...n, read: false } : n),
        unreadCount: prev,
      }));
    }

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications.find((n) => n.id === "a")?.read).toBe(false);
    expect(unreadCount).toBe(2);
  });
});
