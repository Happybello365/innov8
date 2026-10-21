/**
 * Tests for useCachedTradeDetail (shim) and the underlying useTradeDetail hook.
 *
 * Strategy: mock offlineCache, useOffline, useAuth, and api so we can control
 * cache-hit/miss/stale states and verify the hook's state transitions.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useCachedTradeDetail } from "../useCachedTradeDetail";
import * as offlineCache from "@/lib/offlineCache";
import * as useOfflineModule from "@/hooks/useOffline";
import * as useAuthModule from "@/hooks/useAuth";
import * as apiModule from "@/lib/api";

// ─── Module mocks ─────────────────────────────────────────────────────────

jest.mock("@/lib/offlineCache", () => ({
  cacheRead: jest.fn(),
  cacheWrite: jest.fn(),
  cacheInvalidate: jest.fn(),
}));

jest.mock("@/hooks/useOffline", () => ({
  useOffline: jest.fn(),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  api: {
    trades: {
      get: jest.fn(),
    },
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

const mockUseOffline = useOfflineModule.useOffline as jest.Mock;
const mockUseAuth = useAuthModule.useAuth as jest.Mock;
const mockCacheRead = offlineCache.cacheRead as jest.Mock;
const mockCacheWrite = offlineCache.cacheWrite as jest.Mock;
const mockCacheInvalidate = offlineCache.cacheInvalidate as jest.Mock;
const mockTradesGet = (apiModule.api.trades.get) as jest.Mock;

const MOCK_TOKEN = "test-token";
const MOCK_TRADE = {
  tradeId: "T-001",
  buyerAddress: "GBUYER123456789012345678901234567890123456789012345678",
  sellerAddress: "GSELLER123456789012345678901234567890123456789012345",
  amountCngn: "10000",
  status: "FUNDED",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const UPDATED_TRADE = { ...MOCK_TRADE, status: "DELIVERED" };

function setupOnline() {
  mockUseOffline.mockReturnValue({ isOffline: false });
  mockUseAuth.mockReturnValue({ token: MOCK_TOKEN, isAuthenticated: true });
}

function setupOffline() {
  mockUseOffline.mockReturnValue({ isOffline: true });
  mockUseAuth.mockReturnValue({ token: MOCK_TOKEN, isAuthenticated: true });
}

function setupUnauthenticated() {
  mockUseOffline.mockReturnValue({ isOffline: false });
  mockUseAuth.mockReturnValue({ token: null, isAuthenticated: false });
}

function missResult() {
  return { entry: null, isStale: false, isMiss: true };
}

function hitResult(data: unknown, isStale = false) {
  return {
    entry: { data, cachedAt: Date.now() },
    isStale,
    isMiss: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTradesGet.mockResolvedValue(MOCK_TRADE);
});

// ─── Cache miss (cold start) ──────────────────────────────────────────────

describe("useCachedTradeDetail — cache miss", () => {
  it("starts loading when there is no cached entry", () => {
    setupOnline();
    mockCacheRead.mockReturnValue(missResult());
    mockTradesGet.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    expect(result.current.loading).toBe(true);
    expect(result.current.trade).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it("fetches from network and resolves trade on success", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(missResult());

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trade).toEqual(MOCK_TRADE);
    expect(result.current.error).toBeNull();
    expect(mockTradesGet).toHaveBeenCalledWith(MOCK_TOKEN, "T-001");
    expect(mockCacheWrite).toHaveBeenCalledWith("trade_detail", "T-001", MOCK_TRADE);
  });

  it("sets error and stops loading when API call fails", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(missResult());
    mockTradesGet.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network failure");
    expect(result.current.trade).toBeNull();
  });

  it("does not fetch when unauthenticated", () => {
    setupUnauthenticated();
    mockCacheRead.mockReturnValue(missResult());

    renderHook(() => useCachedTradeDetail("T-001"));

    expect(mockTradesGet).not.toHaveBeenCalled();
  });
});

// ─── Cache hit (fresh) ────────────────────────────────────────────────────

describe("useCachedTradeDetail — cache hit (fresh)", () => {
  it("seeds from cache immediately without loading state", () => {
    setupOnline();
    mockCacheRead.mockReturnValue(hitResult(MOCK_TRADE, false));

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    expect(result.current.trade).toEqual(MOCK_TRADE);
    expect(result.current.loading).toBe(false);
    expect(result.current.isStale).toBe(false);
  });

  it("still triggers a background revalidation when online", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(hitResult(MOCK_TRADE, false));

    renderHook(() => useCachedTradeDetail("T-001"));

    await waitFor(() => expect(mockTradesGet).toHaveBeenCalledTimes(1));
  });
});

// ─── Cache hit (stale) ────────────────────────────────────────────────────

describe("useCachedTradeDetail — cache hit (stale)", () => {
  it("seeds stale data and clears isStale after network refresh", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(hitResult(MOCK_TRADE, true));

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    expect(result.current.isStale).toBe(true);
    expect(result.current.trade).toEqual(MOCK_TRADE);

    await waitFor(() => expect(result.current.isStale).toBe(false));
    expect(result.current.trade).toEqual(MOCK_TRADE);
  });
});

// ─── Offline behaviour ────────────────────────────────────────────────────

describe("useCachedTradeDetail — offline", () => {
  it("serves cached data and does not call the API", () => {
    setupOffline();
    mockCacheRead.mockReturnValue(hitResult(MOCK_TRADE, true));

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    expect(result.current.trade).toEqual(MOCK_TRADE);
    expect(result.current.isStale).toBe(true);
    expect(mockTradesGet).not.toHaveBeenCalled();
  });

  it("shows loading with null data when offline and no cache", () => {
    setupOffline();
    mockCacheRead.mockReturnValue(missResult());

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    expect(result.current.trade).toBeNull();
    expect(mockTradesGet).not.toHaveBeenCalled();
  });
});

// ─── Trade updated elsewhere ──────────────────────────────────────────────

describe("useCachedTradeDetail — trade updated elsewhere", () => {
  it("reflects new data after refetch when trade status changes", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(hitResult(MOCK_TRADE, false));
    mockTradesGet
      .mockResolvedValueOnce(MOCK_TRADE)
      .mockResolvedValueOnce(UPDATED_TRADE);

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    await waitFor(() => expect(mockTradesGet).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.trade).toEqual(UPDATED_TRADE));
  });
});

// ─── Manual invalidation ──────────────────────────────────────────────────

describe("useCachedTradeDetail — invalidateAndRefetch", () => {
  it("clears cache entry, sets loading, then fetches fresh data", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(hitResult(MOCK_TRADE, false));

    const { result } = renderHook(() => useCachedTradeDetail("T-001"));

    await waitFor(() => expect(mockTradesGet).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.invalidateAndRefetch();
    });

    expect(mockCacheInvalidate).toHaveBeenCalledWith("trade_detail", "T-001");

    await waitFor(() => expect(result.current.trade).toEqual(MOCK_TRADE));
    expect(result.current.loading).toBe(false);
  });
});

// ─── tradeId change ───────────────────────────────────────────────────────

describe("useCachedTradeDetail — tradeId change", () => {
  it("re-reads cache and re-fetches when tradeId changes", async () => {
    setupOnline();

    const tradeB = { ...MOCK_TRADE, tradeId: "T-002" };
    mockCacheRead.mockReturnValue(missResult());
    mockTradesGet
      .mockResolvedValueOnce(MOCK_TRADE)
      .mockResolvedValueOnce(tradeB);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useCachedTradeDetail(id),
      { initialProps: { id: "T-001" } },
    );

    await waitFor(() => expect(result.current.trade?.tradeId).toBe("T-001"));

    rerender({ id: "T-002" });

    await waitFor(() => expect(result.current.trade?.tradeId).toBe("T-002"));
    expect(mockTradesGet).toHaveBeenCalledTimes(2);
  });
});
