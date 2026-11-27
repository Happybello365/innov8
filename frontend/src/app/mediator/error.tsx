"use client";

/**
 * Route-level error boundary for the /mediator segment.
 * The mediator segment has no index page, so recovery returns to the dashboard.
 */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function MediatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      segment="mediator"
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
