"use client";

/** Route-level error boundary for the /settings segment. */

import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";

export default function SettingsError({
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
      segment="settings"
      backHref="/settings"
      backLabel="Back to settings"
    />
  );
}
