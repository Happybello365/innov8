/**
 * Webhook endpoint delivery-health aggregates (#471).
 */
export type WebhookRetryState = "healthy" | "retrying" | "failing" | "idle";

export interface WebhookAttemptLike {
  timestamp: Date;
  status: string;
  statusCode: number;
}

export interface WebhookHealthSummary {
  webhookId: number;
  url: string;
  isActive: boolean;
  ageSeconds: number;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  consecutiveFailures: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  secondsSinceLastSuccess: number | null;
  retryState: WebhookRetryState;
}

/** Number of consecutive failures at which an endpoint is considered failing rather than retrying. */
export const FAILING_THRESHOLD = 5;

export function isSuccessfulAttempt(a: WebhookAttemptLike): boolean {
  return a.status.toLowerCase() === "success" || (a.statusCode >= 200 && a.statusCode < 300);
}

export function summarizeWebhookHealth(
  webhook: { id: number; url: string; isActive: boolean; createdAt: Date },
  attempts: WebhookAttemptLike[],
  now: Date = new Date(),
): WebhookHealthSummary {
  const sorted = [...attempts].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  let successCount = 0;
  let lastSuccess: Date | null = null;
  let lastFailure: Date | null = null;
  for (const a of sorted) {
    if (isSuccessfulAttempt(a)) {
      successCount += 1;
      lastSuccess ??= a.timestamp;
    } else {
      lastFailure ??= a.timestamp;
    }
  }
  let consecutiveFailures = 0;
  for (const a of sorted) {
    if (isSuccessfulAttempt(a)) break;
    consecutiveFailures += 1;
  }
  const total = sorted.length;
  const retryState: WebhookRetryState =
    total === 0 ? "idle" : consecutiveFailures === 0 ? "healthy" : consecutiveFailures >= FAILING_THRESHOLD ? "failing" : "retrying";
  const secs = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));

  return {
    webhookId: webhook.id,
    url: webhook.url,
    isActive: webhook.isActive,
    ageSeconds: secs(webhook.createdAt),
    totalAttempts: total,
    successCount,
    failureCount: total - successCount,
    successRate: total === 0 ? null : Number((successCount / total).toFixed(4)),
    consecutiveFailures,
    lastAttemptAt: sorted[0]?.timestamp.toISOString() ?? null,
    lastSuccessAt: lastSuccess?.toISOString() ?? null,
    lastFailureAt: lastFailure?.toISOString() ?? null,
    secondsSinceLastSuccess: lastSuccess ? secs(lastSuccess) : null,
    retryState,
  };
}
