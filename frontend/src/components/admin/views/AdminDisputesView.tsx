"use client";

import { useEffect, useState } from "react";
import type { AdminDashboardFilters } from "../AdminDashboardFilters";

interface DisputeItem {
  tradeId: string;
  initiator: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface AdminDisputesViewProps {
  filters: AdminDashboardFilters;
}

/**
 * Admin disputes view with filtering and graceful error handling.
 *
 * Displays paginated list of disputes with shared filters applied.
 * Handles loading, error, and empty states independently so failures
 * don't affect other entity views.
 */
export function AdminDisputesView({ filters }: AdminDisputesViewProps) {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const fetchDisputes = async () => {
      setLoading(true);
      setError(null);
      try {
        // Build query params from filters
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        
        if (filters.status) params.set("status", filters.status);
        if (filters.search) params.set("search", filters.search);
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);

        // Note: This endpoint needs to be created in the backend
        // For now, we'll show the expected structure
        const response = await fetch(`/api/admin/disputes?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch disputes: ${response.statusText}`);
        }

        const data = await response.json();
        setDisputes(data.disputes || []);
        setTotal(data.pagination?.total || 0);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load disputes. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDisputes();
  }, [filters, page]);

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
          <p className="text-text-secondary">Loading disputes...</p>
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

  if (disputes.length === 0) {
    return (
      <div className="rounded-lg bg-bg-elevated border border-border-default p-12 text-center">
        <p className="text-text-secondary">No disputes found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Disputes Table */}
      <div className="overflow-x-auto rounded-lg border border-border-default">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated border-b border-border-default">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Trade ID</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Initiator</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Reason</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Created</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((dispute) => (
              <tr key={dispute.tradeId} className="border-b border-border-default hover:bg-bg-elevated/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-text-primary truncate">{dispute.tradeId.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-mono text-xs text-text-secondary truncate">{dispute.initiator.slice(0, 6)}...</td>
                <td className="px-4 py-3 text-text-primary truncate">{dispute.reason}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-1 rounded-full text-xs bg-status-danger/10 text-status-danger">
                    {dispute.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">
                  {new Date(dispute.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between py-4">
        <p className="text-sm text-text-secondary">
          Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} disputes
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-2 rounded-md border border-border-default text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            ← Previous
          </button>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * limit >= total}
            className="px-3 py-2 rounded-md border border-border-default text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
