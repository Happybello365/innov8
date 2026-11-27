"use client";

/** Route-level error boundary for the /streams segment. */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function StreamsError({
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
      segment="streams"
      backHref="/streams"
      backLabel="Back to streams"
    />
  );
}
