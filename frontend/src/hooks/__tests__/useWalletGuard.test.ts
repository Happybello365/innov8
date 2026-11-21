/**
 * Tests for useWalletGuard (#484)
 */

import { act, renderHook } from "@testing-library/react";
import { useWalletGuard } from "../useWalletGuard";

describe("useWalletGuard", () => {
  it("starts with disconnectedMidSubmit = false", () => {
    const { result } = renderHook(() =>
      useWalletGuard({ isSubmitting: false, isWalletConnected: true }),
    );
    expect(result.current.disconnectedMidSubmit).toBe(false);
  });

  it("sets disconnectedMidSubmit when wallet drops mid-submit", () => {
    const { result, rerender } = renderHook(
      ({ submitting, connected }: { submitting: boolean; connected: boolean }) =>
        useWalletGuard({ isSubmitting: submitting, isWalletConnected: connected }),
      { initialProps: { submitting: true, connected: true } },
    );

    expect(result.current.disconnectedMidSubmit).toBe(false);

    // Wallet disconnects while submitting
    act(() => {
      rerender({ submitting: true, connected: false });
    });

    expect(result.current.disconnectedMidSubmit).toBe(true);
  });

  it("does not set flag when wallet drops outside of submission", () => {
    const { result, rerender } = renderHook(
      ({ submitting, connected }: { submitting: boolean; connected: boolean }) =>
        useWalletGuard({ isSubmitting: submitting, isWalletConnected: connected }),
      { initialProps: { submitting: false, connected: true } },
    );

    act(() => {
      rerender({ submitting: false, connected: false });
    });

    expect(result.current.disconnectedMidSubmit).toBe(false);
  });

  it("clearDisconnectFlag resets the flag", () => {
    const { result, rerender } = renderHook(
      ({ submitting, connected }: { submitting: boolean; connected: boolean }) =>
        useWalletGuard({ isSubmitting: submitting, isWalletConnected: connected }),
      { initialProps: { submitting: true, connected: true } },
    );

    act(() => {
      rerender({ submitting: true, connected: false });
    });
    expect(result.current.disconnectedMidSubmit).toBe(true);

    act(() => {
      result.current.clearDisconnectFlag();
    });
    expect(result.current.disconnectedMidSubmit).toBe(false);
  });

  it("fires wallet-disconnected-mid-submit custom event on window", () => {
    const listener = jest.fn();
    window.addEventListener("wallet-disconnected-mid-submit", listener);

    const { rerender } = renderHook(
      ({ submitting, connected }: { submitting: boolean; connected: boolean }) =>
        useWalletGuard({ isSubmitting: submitting, isWalletConnected: connected }),
      { initialProps: { submitting: true, connected: true } },
    );

    act(() => {
      rerender({ submitting: true, connected: false });
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("wallet-disconnected-mid-submit", listener);
  });
});
