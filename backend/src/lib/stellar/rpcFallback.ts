/**
 * Stellar RPC fallback provider policy (issue #465).
 *
 * Holds an ordered list of RPC endpoints (primary first, then
 * STELLAR_RPC_FALLBACK_URLS). Each call goes to the healthiest provider;
 * on failure the provider is marked unhealthy for a cooldown and the call
 * fails over to the next one. URLs are never included in thrown errors
 * (they may embed API keys); providers are identified by index.
 */

export interface RpcProviderHealth {
  index: number;
  healthy: boolean;
  consecutiveFailures: number;
  unhealthyUntil: number | null;
  lastLatencyMs: number | null;
}

export interface RpcFallbackOptions {
  /** Consecutive failures before a provider is benched. */
  failureThreshold?: number;
  /** How long a benched provider is skipped, ms. */
  cooldownMs?: number;
  now?: () => number;
}

export class AllRpcProvidersFailedError extends Error {
  constructor(public readonly attempts: number) {
    super(`All ${attempts} Stellar RPC provider(s) failed`);
    this.name = "AllRpcProvidersFailedError";
  }
}

export function parseRpcProviderUrls(primary: string | undefined, fallbacks: string | undefined): string[] {
  const urls = [primary, ...(fallbacks ?? "").split(",")]
    .map((u) => (u ?? "").trim())
    .filter((u) => u.length > 0);
  return [...new Set(urls)];
}

export class RpcFallbackPolicy {
  private readonly health: RpcProviderHealth[];
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(private readonly urls: string[], opts: RpcFallbackOptions = {}) {
    if (urls.length === 0) throw new Error("At least one Stellar RPC provider URL is required");
    this.failureThreshold = Math.max(1, opts.failureThreshold ?? 1);
    this.cooldownMs = Math.max(0, opts.cooldownMs ?? 30_000);
    this.now = opts.now ?? Date.now;
    this.health = urls.map((_, index) => ({
      index,
      healthy: true,
      consecutiveFailures: 0,
      unhealthyUntil: null,
      lastLatencyMs: null,
    }));
  }

  /** Provider indices in selection order: healthy (by config order), then benched (soonest-recovering first). */
  selectionOrder(): number[] {
    const t = this.now();
    for (const h of this.health) {
      if (!h.healthy && h.unhealthyUntil !== null && h.unhealthyUntil <= t) {
        h.healthy = true; // cooldown elapsed — eligible for a probe
        h.unhealthyUntil = null;
      }
    }
    const healthy = this.health.filter((h) => h.healthy).map((h) => h.index);
    const benched = this.health
      .filter((h) => !h.healthy)
      .sort((a, b) => (a.unhealthyUntil ?? 0) - (b.unhealthyUntil ?? 0))
      .map((h) => h.index);
    return [...healthy, ...benched];
  }

  reportSuccess(index: number, latencyMs: number): void {
    const h = this.health[index];
    h.healthy = true;
    h.consecutiveFailures = 0;
    h.unhealthyUntil = null;
    h.lastLatencyMs = latencyMs;
  }

  reportFailure(index: number): void {
    const h = this.health[index];
    h.consecutiveFailures += 1;
    if (h.consecutiveFailures >= this.failureThreshold) {
      h.healthy = false;
      h.unhealthyUntil = this.now() + this.cooldownMs;
    }
  }

  /** Run `fn` against providers in health order until one succeeds. */
  async execute<T>(fn: (url: string) => Promise<T>): Promise<T> {
    const order = this.selectionOrder();
    for (const index of order) {
      const started = this.now();
      try {
        const result = await fn(this.urls[index]);
        this.reportSuccess(index, this.now() - started);
        return result;
      } catch {
        this.reportFailure(index);
      }
    }
    throw new AllRpcProvidersFailedError(order.length);
  }

  snapshot(): RpcProviderHealth[] {
    return this.health.map((h) => ({ ...h }));
  }
}

