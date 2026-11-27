/**
 * API Key Scope Simulator Service (#476)
 *
 * Evaluates whether a hypothetical or real API key with a given set of scopes
 * can perform a requested action.  This is a pure dry-run: it neither creates
 * keys nor makes any mutations.
 *
 * Scopes follow a "resource:verb" convention, e.g. "trades:read",
 * "trades:write", "evidence:upload", "admin:*".  A wildcard scope
 * "<resource>:*" grants every verb on that resource; "admin:*" grants
 * everything.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimulateRequest {
  /** The key's declared scopes, e.g. ["trades:read", "evidence:upload"] */
  scopes: string[];
  /** The action to test, e.g. "trades:write" */
  action: string;
  /** Optional context forwarded verbatim to the result for the caller's use. */
  context?: Record<string, unknown>;
}

export type SimulateVerdict = "allowed" | "denied";

export interface SimulateResult {
  action: string;
  verdict: SimulateVerdict;
  /** Which scope(s) matched the action, if any. */
  matchedScopes: string[];
  /** Why the request was denied, when verdict is "denied". */
  deniedReason?: string;
  /** Mirror of the caller-supplied context. */
  context?: Record<string, unknown>;
  dryRun: true;
}

// ─── Known actions registry ───────────────────────────────────────────────────

/**
 * Complete set of known platform actions.  Every action follows the pattern
 * "<resource>:<verb>".  "admin:*" is a super-scope that unlocks all of these.
 */
export const KNOWN_ACTIONS = new Set([
  "trades:read",
  "trades:write",
  "trades:export",
  "trades:batch",
  "evidence:read",
  "evidence:upload",
  "disputes:read",
  "disputes:write",
  "wallet:read",
  "users:read",
  "users:write",
  "goals:read",
  "goals:write",
  "webhooks:read",
  "webhooks:write",
  "notifications:read",
  "admin:read",
  "admin:write",
  "admin:sessions",
  "admin:reports",
  "admin:contract",
  "admin:streams",
  "admin:payouts",
  "admin:features",
  "admin:audit",
  "admin:dlq",
  "admin:api-key-simulator",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAction(action: string): { resource: string; verb: string } | null {
  const parts = action.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { resource: parts[0], verb: parts[1] };
}

function scopeGrantsAction(scope: string, action: string): boolean {
  // admin:* grants everything
  if (scope === "admin:*") return true;

  const parsed = parseAction(scope);
  const target = parseAction(action);
  if (!parsed || !target) return false;

  // Wildcard on resource: "trades:*" covers any trades verb
  if (parsed.resource === target.resource && parsed.verb === "*") return true;

  // Exact match
  return scope === action;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ApiKeyScopeService {
  /**
   * Evaluate whether the declared scopes permit the given action.
   *
   * Rules (applied in order):
   *  1. "admin:*" is an unconditional super-grant.
   *  2. "<resource>:*" grants all verbs for that resource.
   *  3. Exact scope match.
   *  4. No match → denied.
   */
  simulate(req: SimulateRequest): SimulateResult {
    const { scopes, action, context } = req;

    const matched = scopes.filter((s) => scopeGrantsAction(s, action));

    const verdict: SimulateVerdict = matched.length > 0 ? "allowed" : "denied";

    const result: SimulateResult = {
      action,
      verdict,
      matchedScopes: matched,
      dryRun: true,
    };

    if (verdict === "denied") {
      result.deniedReason = `No scope in [${scopes.join(", ")}] grants '${action}'.`;
    }

    if (context !== undefined) {
      result.context = context;
    }

    return result;
  }

  /**
   * Bulk simulate: evaluate multiple actions in a single call.
   * Returns one result per action in the same order.
   */
  simulateBatch(scopes: string[], actions: string[], context?: Record<string, unknown>): SimulateResult[] {
    return actions.map((action) => this.simulate({ scopes, action, context }));
  }

  /**
   * List every recognised platform action so callers can discover what's
   * available without trial-and-error.
   */
  listKnownActions(): string[] {
    return Array.from(KNOWN_ACTIONS).sort();
  }
}

export const apiKeyScopeService = new ApiKeyScopeService();
