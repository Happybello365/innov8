import { act, renderHook } from "@testing-library/react";
import { useErrorHandler } from "../useErrorHandler";
import { ApiError } from "@/lib/api/client";

// ── Mock useToast ─────────────────────────────────────────────────────────────
const addToast = jest.fn().mockReturnValue("toast-id");

jest.mock("../useToast", () => ({
  useToast: () => ({ addToast }),
}));

// ── Mock api/client so ApiError constructor doesn't call parseBackendError ────
jest.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    status: number;
    data: unknown;
    backendError: null = null;
    constructor(status: number, message: string, data?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data ?? null;
    }
  }
  return { ApiError };
});

// ── Mock errorHandler lib ─────────────────────────────────────────────────────
jest.mock("@/lib/errorHandler", () => ({
  getErrorInfo: jest.fn(),
  isAuthError: jest.fn(),
  isNetworkError: jest.fn(),
  isRetryableError: jest.fn(),
}));

import {
  getErrorInfo,
  isAuthError,
  isNetworkError,
  isRetryableError,
} from "@/lib/errorHandler";

const mockedGetErrorInfo = getErrorInfo as jest.MockedFunction<typeof getErrorInfo>;
const mockedIsAuthError = isAuthError as jest.MockedFunction<typeof isAuthError>;
const mockedIsNetworkError = isNetworkError as jest.MockedFunction<typeof isNetworkError>;
const mockedIsRetryableError = isRetryableError as jest.MockedFunction<typeof isRetryableError>;

function makeErrorInfo(overrides?: Partial<{ title: string; message: string; type: "error" | "warning" | "info" | "success" }>) {
  return {
    title: "Something Went Wrong",
    message: "An unexpected error occurred",
    type: "error" as const,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetErrorInfo.mockReturnValue(makeErrorInfo());
  mockedIsAuthError.mockReturnValue(false);
  mockedIsNetworkError.mockReturnValue(false);
  mockedIsRetryableError.mockReturnValue(false);
});

// ── handleError ───────────────────────────────────────────────────────────────

describe("handleError", () => {
  it("converts a plain Error to ApiError and shows a toast", () => {
    const { result } = renderHook(() => useErrorHandler());
    const plain = new Error("something failed");

    let returned: ApiError | undefined;
    act(() => {
      returned = result.current.handleError(plain);
    });

    expect(returned).toBeInstanceOf(ApiError);
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
  });

  it("passes an ApiError through unchanged", () => {
    const { result } = renderHook(() => useErrorHandler());
    const apiErr = new ApiError(422, "Validation failed");

    let returned: ApiError | undefined;
    act(() => {
      returned = result.current.handleError(apiErr);
    });

    expect(returned).toBe(apiErr);
  });

  it("wraps an unexpected non-Error value in ApiError", () => {
    const { result } = renderHook(() => useErrorHandler());

    let returned: ApiError | undefined;
    act(() => {
      returned = result.current.handleError({ weirdShape: true });
    });

    expect(returned).toBeInstanceOf(ApiError);
    expect(returned!.status).toBe(0);
  });

  it("uses the customMessage when provided", () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error("orig"), { customMessage: "Override!" });
    });

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Override!" })
    );
  });

  it("skips the toast when showToast is false", () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error("silent"), { showToast: false });
    });

    expect(addToast).not.toHaveBeenCalled();
  });

  it("sets toast duration to 6000 for error type and 4000 for others", () => {
    mockedGetErrorInfo.mockReturnValueOnce(makeErrorInfo({ type: "error" }));
    mockedGetErrorInfo.mockReturnValueOnce(makeErrorInfo({ type: "warning" }));

    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error("e1"));
    });
    expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 6000 }));

    act(() => {
      result.current.handleError(new Error("e2"));
    });
    expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 4000 }));
  });
});

// ── handleAuthError ───────────────────────────────────────────────────────────

describe("handleAuthError", () => {
  it("returns true and shows session-expired toast when isAuthError is true", () => {
    mockedIsAuthError.mockReturnValue(true);
    const { result } = renderHook(() => useErrorHandler());

    let isAuth: boolean | undefined;
    act(() => {
      isAuth = result.current.handleAuthError(new ApiError(401, "Unauthorized"));
    });

    expect(isAuth).toBe(true);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Your session has expired. Please log in again." })
    );
  });

  it("returns false and shows no toast when isAuthError is false", () => {
    mockedIsAuthError.mockReturnValue(false);
    const { result } = renderHook(() => useErrorHandler());

    let isAuth: boolean | undefined;
    act(() => {
      isAuth = result.current.handleAuthError(new Error("not auth"));
    });

    expect(isAuth).toBe(false);
    expect(addToast).not.toHaveBeenCalled();
  });
});

// ── handleNetworkError ────────────────────────────────────────────────────────

describe("handleNetworkError", () => {
  it("returns true and shows network toast when isNetworkError is true", () => {
    mockedIsNetworkError.mockReturnValue(true);
    const { result } = renderHook(() => useErrorHandler());

    let isNet: boolean | undefined;
    act(() => {
      isNet = result.current.handleNetworkError(new Error("fetch failed"));
    });

    expect(isNet).toBe(true);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Network connection failed. Please check your internet connection.",
      })
    );
  });

  it("returns false when isNetworkError is false", () => {
    mockedIsNetworkError.mockReturnValue(false);
    const { result } = renderHook(() => useErrorHandler());

    let isNet: boolean | undefined;
    act(() => {
      isNet = result.current.handleNetworkError(new ApiError(400, "bad request"));
    });

    expect(isNet).toBe(false);
    expect(addToast).not.toHaveBeenCalled();
  });
});

// ── handleRetryableError ──────────────────────────────────────────────────────

describe("handleRetryableError", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns true and shows retrying toast when isRetryableError is true", () => {
    mockedIsRetryableError.mockReturnValue(true);
    const { result } = renderHook(() => useErrorHandler());

    let isRetry: boolean | undefined;
    act(() => {
      isRetry = result.current.handleRetryableError(new Error("timeout"));
    });

    expect(isRetry).toBe(true);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "A temporary error occurred. Please try again.",
      })
    );
  });

  it("invokes retryFn after 1 s when provided", () => {
    mockedIsRetryableError.mockReturnValue(true);
    const retryFn = jest.fn();
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleRetryableError(new Error("timeout"), retryFn);
    });

    expect(retryFn).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(retryFn).toHaveBeenCalledTimes(1);
  });

  it("shows 'Retrying...' message when retryFn is provided", () => {
    mockedIsRetryableError.mockReturnValue(true);
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleRetryableError(new Error("timeout"), jest.fn());
    });

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Temporary error. Retrying..." })
    );
  });

  it("returns false when isRetryableError is false", () => {
    mockedIsRetryableError.mockReturnValue(false);
    const { result } = renderHook(() => useErrorHandler());

    let isRetry: boolean | undefined;
    act(() => {
      isRetry = result.current.handleRetryableError(new ApiError(400, "bad input"));
    });

    expect(isRetry).toBe(false);
    expect(addToast).not.toHaveBeenCalled();
  });
});
