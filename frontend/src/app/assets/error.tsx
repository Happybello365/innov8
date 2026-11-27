"use client";

/** Route-level error boundary for the /assets segment. */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function AssetsError({
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
      segment="assets"
      backHref="/assets"
      backLabel="Back to assets"
    />
  );
}
