"use client";

/** Route-level error boundary for the /help segment. */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function HelpError({
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
      segment="help"
      backHref="/help"
      backLabel="Back to help"
    />
  );
}
