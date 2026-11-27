"use client";

/**
 * Shared body for route-segment error boundaries (`error.tsx` files).
 *
 * Each segment's `error.tsx` is a thin wrapper that supplies the segment name
 * and a safe "back" destination. This component reports the error once per
 * mount and renders the branded fallback with a stable correlation ID.
 */

import { useEffect, useState } from "react";
import { generateCorrelationId, resolveCorrelationId } from "@/lib/correlationId";
import { reportBoundaryError } from "@/lib/errorReporter";
import { ErrorBoundaryFallbackPage } from "@/components/ui/ErrorBoundaryFallbackPage";

export interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Stable segment name, used in error reports (e.g. "vault"). */
  segment: string;
  /** Where the "back" action goes. Must be a route that exists. */
  backHref: string;
  backLabel: string;
}

export function RouteErrorBoundary({
  error,
  reset,
  segment,
  backHref,
  backLabel,
}: RouteErrorBoundaryProps) {
  // Compute the ID once per error so re-renders show the same reference the
  // report was filed under.
  const [correlationId] = useState(() =>
    resolveCorrelationId(error, error.digest ?? generateCorrelationId()),
  );

  useEffect(() => {
    reportBoundaryError({
      error,
      componentStack: null,
      correlationId,
      route:
        typeof window !== "undefined" ? window.location.pathname : segment,
      meta: { segment, digest: error.digest },
    });
    // Report once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundaryFallbackPage
      correlationId={correlationId}
      onRetry={reset}
      errorMessage={
        process.env.NODE_ENV !== "production" ? error.message : undefined
      }
      backLabel={backLabel}
      backHref={backHref}
    />
  );
}
