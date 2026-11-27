"use client";

/** Route-level error boundary for the /reputation segment. */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function ReputationError({
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
      segment="reputation"
      backHref="/reputation"
      backLabel="Back to reputation"
    />
  );
}
