/**
 * CSP nonce helpers (issue 506).
 *
 * `middleware.ts` generates a per-request nonce and forwards it as the
 * `x-nonce` request header. Any inline <script> rendered by the App Router must
 * carry the same nonce, or the enforced `script-src 'nonce-…' 'strict-dynamic'`
 * policy blocks it.
 */
export const CSP_NONCE_HEADER = "x-nonce";

// Base64 alphabet (standard or URL-safe) with optional padding.
const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

export function readCspNonce(
  headers: { get(name: string): string | null },
): string | undefined {
  const value = headers.get(CSP_NONCE_HEADER)?.trim();
  if (!value || value.length > 256 || !NONCE_PATTERN.test(value)) return undefined;
  return value;
}
