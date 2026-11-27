/**
 * Centralized pagination metadata helper (issue #449).
 *
 * All offset-based list endpoints return the same `PaginationMeta` envelope.
 * Use `buildPaginationMeta` to construct it and `parsePaginationParams` to
 * validate and normalise inbound query parameters.
 *
 * Cursor-based endpoints use `cursorPagination.ts` instead; this module is
 * only for `page`/`limit` offset pagination.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Consistent pagination metadata returned by every list endpoint. */
export interface PaginationMeta {
  /** Current page number (1-indexed). */
  page: number;
  /** Maximum number of items per page. */
  limit: number;
  /** Total number of matching records across all pages. */
  total: number;
  /** Total number of pages (always ≥ 1). */
  totalPages: number;
}

/** Validated and normalised pagination parameters extracted from a request. */
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MIN_LIMIT = 1;

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

/** Thrown when an unsupported cursor parameter is supplied to an offset-only endpoint. */
export class UnsupportedCursorError extends Error {
  readonly status = 400;
  constructor() {
    super(
      "This endpoint does not support cursor-based pagination. " +
        "Remove the 'cursor' parameter and use 'page'/'limit' instead.",
    );
    this.name = "UnsupportedCursorError";
  }
}

/** Thrown when `page` or `limit` are present but have an invalid value. */
export class InvalidPaginationParamsError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidPaginationParamsError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a `PaginationMeta` object from a page number, limit, and total count.
 *
 * `totalPages` is always at least 1 — an empty result set has one (empty) page.
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Parse and validate `page` and `limit` query parameters.
 *
 * Accepts string inputs (as Express delivers them) and coerces to integers.
 * Returns normalised `PaginationParams` including the precomputed `skip` offset.
 *
 * @throws {InvalidPaginationParamsError} when `page` or `limit` are present
 *   but non-numeric, negative, or exceed `MAX_LIMIT`.
 * @throws {UnsupportedCursorError} when a `cursor` key is present in `query`,
 *   since this module is for offset-only endpoints.
 */
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  // Reject cursor parameters so callers get a clear error instead of silently
  // ignoring the cursor and returning offset-based results.
  if ("cursor" in query && query.cursor !== undefined && query.cursor !== "") {
    throw new UnsupportedCursorError();
  }

  const rawPage = query.page;
  const rawLimit = query.limit;

  const page = rawPage === undefined ? DEFAULT_PAGE : coercePositiveInt(rawPage, "page");
  const limit = rawLimit === undefined
    ? DEFAULT_LIMIT
    : clamp(coercePositiveInt(rawLimit, "limit"), MIN_LIMIT, MAX_LIMIT);

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Coerce an unknown query value to a positive integer or throw
 * `InvalidPaginationParamsError` with a descriptive message.
 */
function coercePositiveInt(raw: unknown, field: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new InvalidPaginationParamsError(
      `'${field}' must be a positive integer (got: ${JSON.stringify(raw)})`,
    );
  }
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
