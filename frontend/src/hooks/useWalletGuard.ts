"use client";

/**
 * useWalletGuard (#484)
 *
 * Detects when the wallet disconnects while a submission is in-flight and
 * returns a stable "disconnected mid-submit" flag together with a recovery
 * helper.
 *
 * Usage:
 *   const { disconnectedMidSubmit, clearDisconnectFlag } = useWalletGuard({
 *     isSubmitting,
 *     isWalletConnected,
 *   });
 *
 * The hook fires a "wallet-disconnected-mid-submit" event on the window so
 * other components can react (e.g. show a toast, freeze submit buttons).
 *
 * Form state is NOT cleared by this hook — that responsibility belongs to
 * the caller so the user can re-authenticate and retry without re-entering
 * their data.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseWalletGuardOptions {
  /** True while the form submission / signing flow is running. */
  isSubmitting: boolean;
  /** True while the wallet extension reports a live connection. */
  isWalletConnected: boolean;
}

export interface UseWalletGuardResult {
  /**
   * True when the wallet dropped during an active submission.
   * Consumers should surface a recoverable error message rather than a fatal
   * one and keep the form pre-filled so the user can reconnect and retry.
   */
  disconnectedMidSubmit: boolean;
  /** Call this after the user reconnects and re-authenticates to reset the flag. */
  clearDisconnectFlag: () => void;
}

export function useWalletGuard({
  isSubmitting,
  isWalletConnected,
}: UseWalletGuardOptions): UseWalletGuardResult {
  const [disconnectedMidSubmit, setDisconnectedMidSubmit] = useState(false);
  // Track whether the wallet was connected at the start of the last submission.
  const wasConnectedRef = useRef(isWalletConnected);
  const isSubmittingRef = useRef(isSubmitting);

  // Keep refs in sync without triggering extra effects.
  isSubmittingRef.current = isSubmitting;

  useEffect(() => {
    // If the wallet just reconnected while the flag is still set, do not
    // auto-clear — let the user take explicit action (call clearDisconnectFlag)
    // so they confirm they want to retry rather than accidentally double-submit.

    if (isSubmitting) {
      // Record that a submission started with the wallet connected.
      wasConnectedRef.current = isWalletConnected;
    }
  }, [isSubmitting, isWalletConnected]);

  useEffect(() => {
    // We only care about a disconnect that happens *during* an active submission.
    if (!isSubmittingRef.current) return;
    if (isWalletConnected) {
      wasConnectedRef.current = true;
      return;
    }

    // Wallet is now disconnected while submission is active.
    if (wasConnectedRef.current) {
      setDisconnectedMidSubmit(true);
      wasConnectedRef.current = false;

      // Notify other listeners (e.g. toast provider) via a custom DOM event.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wallet-disconnected-mid-submit"));
      }
    }
  }, [isWalletConnected]);

  const clearDisconnectFlag = useCallback(() => {
    setDisconnectedMidSubmit(false);
    wasConnectedRef.current = isWalletConnected;
  }, [isWalletConnected]);

  return { disconnectedMidSubmit, clearDisconnectFlag };
}
