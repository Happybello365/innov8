"use client";

import { useEffect, useState } from "react";
import type { AdminDashboardFilters } from "../AdminDashboardFilters";
import { ForbiddenState } from "@/components/ui/ForbiddenState";

interface TradeItem {
  tradeId: string;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: string;
  status: string;
  createdAt: string;
}

interface AdminTradesViewProps {
  filters: AdminDashboardFilters;
}

/**
 * Admin trades view with filtering and graceful error handling.
 *
 * Displays paginated list of trades with shared filters applied.
 * Handles loading, error, and empty states independently so failures
 * don't affect other entity views.
 */
export function AdminTradesView({ filters }: AdminTradesViewProps) {
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const fetchTrades = async () => {
      setLoading(true);
      setError(null);
      setForbidden(false);
      try {
        // Build query params from filters
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        
        if (filters.status) params.set("status", filters.status);
        if (filters.search) params.set("search", filters.search);
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);

        const response = await fetch(`/api/admin/trades?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (response.status === 403) {
          setForbidden(true);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch trades: ${response.statusText}`);
        }

        const data = await response.json();
        setTrades(data.trades || []);
        setTotal(data.pagination?.total || 0);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load trades. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, [filters, page]);

  if (forbidden) {
    return (
      <div className="py-6">
        <ForbiddenState
          title="Admin Access Required"
          message="You do not have permission to view admin trade records."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin w-8 h-8 text-gold mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>
          <p className="text-text-secondary">Loading trades...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-status-danger/10 border border-status-danger/30 p-6 text-center">
        <p className="text-status-danger mb-4">⚠️ {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-full bg-status-danger text-white text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-danger"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">
          Showing {trades.length} of {total} trades
        </p>
      </div>

      {trades.length === 0 ? (
        <div className="rounded-lg bg-surface-1 border border-border-default p-12 text-center">
          <p className="text-text-secondary">No trades found matching current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-text-secondary font-medium">
              <tr>
                <th className="px-4 py-3">Trade ID</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Amount (USDC)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {trades.map((trade) => (
                <tr key={trade.tradeId} className="hover:bg-surface-1/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{trade.tradeId}</td>
                  <td className="px-4 py-3 font-mono text-xs">{trade.buyerAddress}</td>
                  <td className="px-4 py-3 font-mono text-xs">{trade.sellerAddress}</td>
                  <td className="px-4 py-3">{trade.amountUsdc}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-text-primary">
                      {trade.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(trade.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-md border border-border-default disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-text-secondary">
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / limit)}
            className="px-3 py-1.5 rounded-md border border-border-default disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
