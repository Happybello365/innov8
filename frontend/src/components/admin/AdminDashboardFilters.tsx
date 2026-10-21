"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface AdminDashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
}

interface AdminDashboardFiltersProps {
  filters: AdminDashboardFilters;
  onFiltersChange: (filters: AdminDashboardFilters) => void;
  activeTab: "trades" | "disputes" | "streams";
}

/**
 * Shared filter panel for cross-entity dashboard filtering.
 *
 * Provides unified interface for filtering trades, disputes, and streams.
 * Different entity types support different filter dimensions:
 * - All: dateFrom, dateTo, status
 * - Trades: buyerAddress, sellerAddress
 * - Disputes: initiatorAddress, tradeId
 * - Streams: recipientAddress, vestingState
 *
 * Filters are persisted via URL params for shareable dashboard URLs.
 */
export function AdminDashboardFilters({
  filters,
  onFiltersChange,
  activeTab,
}: AdminDashboardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Update URL params when filters change
  const updateUrlParams = useCallback(
    (newFilters: AdminDashboardFilters) => {
      const params = new URLSearchParams(searchParams);
      
      // Update common filters
      if (newFilters.dateFrom) params.set("dateFrom", newFilters.dateFrom);
      else params.delete("dateFrom");
      
      if (newFilters.dateTo) params.set("dateTo", newFilters.dateTo);
      else params.delete("dateTo");
      
      if (newFilters.status) params.set("status", newFilters.status);
      else params.delete("status");
      
      if (newFilters.search) params.set("search", newFilters.search);
      else params.delete("search");

      router.push(`/admin/dashboard?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleFilterChange = (newFilters: AdminDashboardFilters) => {
    onFiltersChange(newFilters);
    updateUrlParams(newFilters);
  };

  const hasActiveFilters =
    filters.dateFrom || filters.dateTo || filters.status || filters.search;

  const clearFilters = () => {
    const cleared: AdminDashboardFilters = {};
    handleFilterChange(cleared);
  };

  return (
    <div className="bg-bg-card rounded-lg border border-border-default p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold rounded px-2 py-1"
            aria-label="Clear all filters"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date From Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="dateFrom" className="text-sm font-medium text-text-secondary">
            From Date
          </label>
          <input
            id="dateFrom"
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) =>
              handleFilterChange({ ...filters, dateFrom: e.target.value })
            }
            className="bg-bg-input border border-border-default rounded-md px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          />
        </div>

        {/* Date To Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="dateTo" className="text-sm font-medium text-text-secondary">
            To Date
          </label>
          <input
            id="dateTo"
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) =>
              handleFilterChange({ ...filters, dateTo: e.target.value })
            }
            className="bg-bg-input border border-border-default rounded-md px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          />
        </div>

        {/* Status Filter - Entity-specific options */}
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium text-text-secondary">
            Status
          </label>
          <select
            id="status"
            value={filters.status || ""}
            onChange={(e) =>
              handleFilterChange({ ...filters, status: e.target.value })
            }
            className="bg-bg-input border border-border-default rounded-md px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            <option value="">All statuses</option>
            {activeTab === "trades" && (
              <>
                <option value="PENDING_SIGNATURE">Pending Signature</option>
                <option value="CREATED">Created</option>
                <option value="FUNDED">Funded</option>
                <option value="DELIVERED">Delivered</option>
                <option value="COMPLETED">Completed</option>
                <option value="DISPUTED">Disputed</option>
              </>
            )}
            {activeTab === "disputes" && (
              <>
                <option value="OPEN">Open</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </>
            )}
            {activeTab === "streams" && (
              <>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="TERMINATED">Terminated</option>
                <option value="COMPLETED">Completed</option>
              </>
            )}
          </select>
        </div>

        {/* Search Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="search" className="text-sm font-medium text-text-secondary">
            Search
          </label>
          <input
            id="search"
            type="text"
            placeholder={
              activeTab === "trades"
                ? "Trade ID or address..."
                : activeTab === "disputes"
                ? "Dispute ID or trade ID..."
                : "Stream ID or address..."
            }
            value={filters.search || ""}
            onChange={(e) =>
              handleFilterChange({ ...filters, search: e.target.value })
            }
            className="bg-bg-input border border-border-default rounded-md px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          />
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mt-4 p-3 rounded-md bg-gold/10 border border-gold/20 text-sm text-gold">
          Filters applied: {[filters.dateFrom && "dateFrom", filters.dateTo && "dateTo", filters.status && "status", filters.search && "search"]
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
    </div>
  );
}
