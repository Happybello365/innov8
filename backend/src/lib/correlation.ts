import { CORRELATION_ID_HEADER, isValidId } from '../middleware/correlationId.middleware';

/**
 * Helpers for carrying a correlation ID across async boundaries that do not
 * share an HTTP request: queued jobs, outbound webhooks and external-service
 * calls. Invalid/unsafe IDs are dropped rather than propagated.
 */
export interface CorrelatedJobData {
  correlationId?: string;
}

/** Attach a correlation ID to a job payload before enqueueing. */
export function withCorrelationId<T extends object>(data: T, correlationId?: string): T & CorrelatedJobData {
  return isValidId(correlationId) ? { ...data, correlationId } : { ...data };
}

/** Read a correlation ID back out of a job payload inside a worker. */
export function getJobCorrelationId(data: unknown): string | undefined {
  const id = (data as CorrelatedJobData | null | undefined)?.correlationId;
  return isValidId(id) ? id : undefined;
}

/** Outbound headers that forward the correlation ID to an external service/webhook. */
export function correlationHeaders(correlationId?: string): Record<string, string> {
  return isValidId(correlationId) ? { [CORRELATION_ID_HEADER]: correlationId } : {};
}
