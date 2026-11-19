"use client";

/**
 * Recovery UI shown when a trade ID does not resolve.
 *
 * Offers: search by trade ID, the user's most recent trades, and routes to
 * the trades list and help/support. Never echoes anything beyond the ID the
 * user already navigated to.
 */

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCachedTrades } from "@/hooks/useCachedTrades";

const TRADE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RECENT_TRADES_LIMIT = 5;

export interface TradeNotFoundStateProps {
  tradeId: string;
}

export function TradeNotFoundState({ tradeId }: TradeNotFoundStateProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const { data, isLoading, error: recentError } = useCachedTrades({
    limit: RECENT_TRADES_LIMIT,
  });

  const recentTrades = data?.items?.slice(0, RECENT_TRADES_LIMIT) ?? [];

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const candidate = query.trim();
    if (!TRADE_ID_PATTERN.test(candidate)) {
      setSearchError("Enter a valid trade ID (letters, numbers, dashes or underscores).");
      return;
    }
    setSearchError(null);
    router.push(`/trades/${encodeURIComponent(candidate)}`);
  };

  return (
    <section
      aria-labelledby="trade-not-found-heading"
      className="space-y-6 rounded-lg border border-border-default bg-bg-card dark:bg-surface-1 p-6"
      data-testid="trade-not-found"
    >
      <div className="space-y-2 text-center">
        <h2 id="trade-not-found-heading" className="text-lg font-semibold text-text-primary">
          Trade not found
        </h2>
        <p className="text-sm text-text-muted">
          We couldn&apos;t find a trade with ID <span className="font-mono">{tradeId}</span>. Check
          the ID, search for another, or pick one of your recent trades.
        </p>
      </div>

      <form onSubmit={handleSearch} noValidate className="space-y-2" aria-label="Search trades by ID">
        <label htmlFor="trade-search-input" className="block text-sm font-medium text-text-primary">
          Search by trade ID
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="trade-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!searchError}
            aria-describedby={searchError ? "trade-search-error" : undefined}
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-4 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <button
            type="submit"
            className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-text-inverse hover:bg-gold-hover transition-colors"
          >
            Search
          </button>
        </div>
        {searchError && (
          <p id="trade-search-error" role="alert" className="text-xs text-status-danger">
            {searchError}
          </p>
        )}
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Recent trades</h3>
        {isLoading && <p className="text-sm text-text-muted">Loading recent trades…</p>}
        {!isLoading && recentError && (
          <p className="text-sm text-status-danger">Couldn&apos;t load recent trades.</p>
        )}
        {!isLoading && !recentError && recentTrades.length === 0 && (
          <p className="text-sm text-text-muted">No recent trades to show.</p>
        )}
        {recentTrades.length > 0 && (
          <ul className="divide-y divide-border-default rounded-lg border border-border-default">
            {recentTrades.map((trade) => (
              <li key={trade.tradeId} className="flex items-center justify-between gap-3 px-4 py-2">
                <Link
                  href={`/trades/${encodeURIComponent(trade.tradeId)}`}
                  className="font-mono text-sm text-gold hover:underline"
                >
                  {trade.tradeId}
                </Link>
                <span className="text-xs text-text-muted">{trade.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav aria-label="Trade recovery actions" className="flex flex-wrap justify-center gap-3">
        <Link
          href="/trades"
          className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-elevated transition-colors"
        >
          View all trades
        </Link>
        <Link
          href="/help"
          className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-elevated transition-colors"
        >
          Get help
        </Link>
      </nav>
    </section>
  );
}
