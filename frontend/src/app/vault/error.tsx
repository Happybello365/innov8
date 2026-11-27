"use client";

/** Route-level error boundary for the /vault segment. */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function VaultError({
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
      segment="vault"
      backHref="/vault"
      backLabel="Back to vault"
    />
  );
}
