"use client";

/**
 * Route-level error boundary for the /admin segment.
 * Admin has no index page, so recovery returns to the dashboard.
 */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function AdminError({
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
      segment="admin"
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
