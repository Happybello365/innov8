import { act, renderHook, waitFor } from "@testing-library/react";
import { useOffline } from "../useOffline";

// ── Stub getApiBaseUrl ────────────────────────────────────────────────────────
jest.mock("@/lib/api/env", () => ({
  getApiBaseUrl: () => "http://localhost:3001",
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function fireOnlineEvent() {
  window.dispatchEvent(new Event("online"));
}

function fireOfflineEvent() {
  window.dispatchEvent(new Event("offline"));
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.useFakeTimers();
  setNavigatorOnline(true);

  // Default: fetch probe succeeds
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
  } as Response);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe("initial state", () => {
  it("starts online when navigator.onLine is true and probe succeeds", async () => {
    const { result } = renderHook(() => useOffline());

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
      expect(result.current.isOffline).toBe(false);
    });
  });

  it("starts offline immediately when navigator.onLine is false", async () => {
    setNavigatorOnline(false);
    const { result } = renderHook(() => useOffline());

    await waitFor(() => {
      expect(result.current.isOffline).toBe(true);
      expect(result.current.wasOffline).toBe(true);
    });
  });
});

// ── Online / offline browser events ──────────────────────────────────────────

describe("browser online/offline events", () => {
  it("sets isOffline false on 'online' event", async () => {
    setNavigatorOnline(false);
    const { result } = renderHook(() => useOffline());

    // wait for initial check to mark offline
    await waitFor(() => expect(result.current.isOffline).toBe(true));

    setNavigatorOnline(true);
    act(() => {
      fireOnlineEvent();
    });

    expect(result.current.isOffline).toBe(false);
  });

  it("sets isOffline true and wasOffline true on 'offline' event", async () => {
    const { result } = renderHook(() => useOffline());

    await waitFor(() => expect(result.current.isOnline).toBe(true));

    act(() => {
      fireOfflineEvent();
    });

    expect(result.current.isOffline).toBe(true);
    expect(result.current.wasOffline).toBe(true);
  });
});

// ── Probe-based detection ─────────────────────────────────────────────────────

describe("probe-based detection", () => {
  it("marks offline when fetch probe throws (network failure)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("fetch failed"));
    const { result } = renderHook(() => useOffline());

    await waitFor(() => {
      expect(result.current.isOffline).toBe(true);
      expect(result.current.wasOffline).toBe(true);
    });
  });

  it("treats 5xx response as online (server reachable)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const { result } = renderHook(() => useOffline());

    await waitFor(() => {
      // 5xx is server error but network is up — should be online
      expect(result.current.isOffline).toBe(false);
    });
  });
});

// ── retryOnline ───────────────────────────────────────────────────────────────

describe("retryOnline", () => {
  it("clears wasOffline when probe succeeds after being offline", async () => {
    // Start offline
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useOffline());

    await waitFor(() => expect(result.current.wasOffline).toBe(true));

    // Now restore connectivity
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    setNavigatorOnline(true);

    await act(async () => {
      await result.current.retryOnline();
    });

    expect(result.current.isOffline).toBe(false);
    expect(result.current.wasOffline).toBe(false);
  });

  it("keeps wasOffline true when probe fails during retry", async () => {
    // Start offline
    global.fetch = jest.fn().mockRejectedValue(new Error("still down"));
    const { result } = renderHook(() => useOffline());

    await waitFor(() => expect(result.current.wasOffline).toBe(true));

    await act(async () => {
      await result.current.retryOnline();
    });

    expect(result.current.wasOffline).toBe(true);
  });
});

// ── Polling interval ──────────────────────────────────────────────────────────

describe("polling interval", () => {
  it("re-checks connectivity every 5 s", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock;

    renderHook(() => useOffline());

    // Initial call on mount
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("clears the polling interval on unmount", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock;

    const { unmount } = renderHook(() => useOffline());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    unmount();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // No additional calls after unmount
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
