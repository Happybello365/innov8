"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { walletApi } from "@/lib/api/wallet";
import type { PathPaymentQuote } from "@/lib/api/types";

/** How long (ms) a quote stays fresh before we show the stale warning. */
export const QUOTE_TTL_MS = 30_000;

/** How long (ms) to debounce amount changes before firing the API call. */
const DEBOUNCE_MS = 500;

export type QuoteStatus =
  | "idle"
  | "loading"
  | "fresh"
  | "stale"
  | "error";

export interface UsePathPaymentQuoteResult {
  /** Best route returned by the backend, or null when unavailable. */
  quote: PathPaymentQuote | null;
  /** Current lifecycle state of the quote. */
  status: QuoteStatus;
  /** Error message when status === "error". */
  errorMessage: string | null;
  /** Seconds remaining before the current quote goes stale (0 when already stale). */
  secondsRemaining: number;
  /** Fire a new quote request immediately, resetting the TTL countdown. */
  refresh: () => void;
}

/**
 * Fetches and maintains a Stellar path-payment quote for a given NGN amount.
 *
 * - Debounces input changes by {@link DEBOUNCE_MS} to avoid hammering the API.
 * - Marks the quote stale after {@link QUOTE_TTL_MS} ms and shows a countdown.
 * - Exposes a `refresh()` function so the user can explicitly re-fetch.
 *
 * @param sourceAmountNgn  Human-readable NGN amount (e.g. "225000"). Pass an
 *                          empty string or "0" to keep the hook idle.
 * @param token            JWT auth token from `useAuth`. Used as a guard — the
 *                          backend reads the token from the session automatically,
 *                          but we skip fetching when the user is not authenticated.
 */
export function usePathPaymentQuote(
  sourceAmountNgn: string,
  token: string | null,
): UsePathPaymentQuoteResult {
  const [quote, setQuote] = useState<PathPaymentQuote | null>(null);
  const [status, setStatus] = useState<QuoteStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Timestamp when the most recent successful fetch completed.
  const fetchedAtRef = useRef<number | null>(null);
  // Countdown interval handle.
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Debounce timer handle.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Abort controller for in-flight requests.
  const abortRef = useRef<AbortController | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();
    const fetchedAt = fetchedAtRef.current;
    if (fetchedAt === null) return;

    const tick = () => {
      const elapsed = Date.now() - fetchedAt;
      const remaining = Math.max(0, QUOTE_TTL_MS - elapsed);
      setSecondsRemaining(Math.ceil(remaining / 1000));
      if (remaining === 0) {
        clearCountdown();
        setStatus("stale");
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
  }, [clearCountdown]);

  const fetchQuote = useCallback(
    async (amount: string) => {
      // Cancel any previous in-flight request.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      setErrorMessage(null);

      try {
        const result = await walletApi.getPathPaymentQuote(
          amount,
          "NGN",
          undefined,
        );

        if (controller.signal.aborted) return;

        const best = result.routes?.[0] ?? null;
        setQuote(best);
        fetchedAtRef.current = Date.now();
        setStatus("fresh");
        startCountdown();
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to fetch quote",
        );
        setQuote(null);
      }
    },
    [startCountdown],
  );

  // Debounced effect: re-fetch when amount or token changes.
  useEffect(() => {
    const amount = sourceAmountNgn.trim();
    const numeric = parseFloat(amount);

    if (!amount || isNaN(numeric) || numeric <= 0 || !token) {
      // Reset to idle when there is nothing to quote.
      setStatus("idle");
      setQuote(null);
      setErrorMessage(null);
      setSecondsRemaining(0);
      clearCountdown();
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      return;
    }

    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchQuote(amount);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [sourceAmountNgn, token, fetchQuote, clearCountdown]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearCountdown();
      abortRef.current?.abort();
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [clearCountdown]);

  const refresh = useCallback(() => {
    const amount = sourceAmountNgn.trim();
    const numeric = parseFloat(amount);
    if (!amount || isNaN(numeric) || numeric <= 0 || !token) return;
    void fetchQuote(amount);
  }, [sourceAmountNgn, token, fetchQuote]);

  return { quote, status, errorMessage, secondsRemaining, refresh };
}
