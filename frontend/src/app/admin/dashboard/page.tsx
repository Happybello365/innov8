"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AdminDashboardTabs } from "@/components/admin/AdminDashboardTabs";
import { AdminDashboardFilters } from "@/components/admin/AdminDashboardFilters";
import type { AdminDashboardFilters as FilterState } from "@/components/admin/AdminDashboardFilters";

/**
 * Admin Analytics Dashboard
 *
 * Provides unified analytics view across trades, disputes, and streams with
 * cross-entity filtering. Filters applied here narrow all three entity views
 * consistently. Each entity view has independent error handling for graceful
 * degradation if one endpoint becomes unavailable.
 *
 * Architecture:
 * - Shared filter state via URL params (for shareable dashboard URLs)
 * - Entity-specific views with independent error states
 * - Graceful degradation: if one entity API fails, others remain visible
 */
export default function AdminDashboardPage() {
  const searchParams = useSearchParams();
  
  // Tab selection from URL or defaults to 'trades'
  const activeTab = (searchParams.get("view") as "trades" | "disputes" | "streams") || "trades";
  
  // Extract filter state from URL params (will be enhanced in AdminDashboardFilters)
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo: searchParams.get("dateTo") || "",
    status: searchParams.get("status") || "",
    search: searchParams.get("search") || "",
  });

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">Analytics Dashboard</h1>
              <p className="text-text-secondary mt-2">
                Cross-entity reporting for trades, disputes, and streams
              </p>
            </div>
            <Link
              href="/admin"
              className="text-text-muted hover:text-text-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold rounded"
            >
              ← Back to Admin
            </Link>
          </div>
        </div>

        {/* Shared Filters */}
        <div className="mb-6">
          <AdminDashboardFilters 
            filters={filters} 
            onFiltersChange={setFilters}
            activeTab={activeTab}
          />
        </div>

        {/* Entity Views with Tabs */}
        <AdminDashboardTabs 
          activeTab={activeTab} 
          filters={filters}
        />
      </div>
    </div>
  );
}
