"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AdminTradesView } from "./views/AdminTradesView";
import { AdminDisputesView } from "./views/AdminDisputesView";
import { AdminStreamsView } from "./views/AdminStreamsView";
import type { AdminDashboardFilters } from "./AdminDashboardFilters";

interface AdminDashboardTabsProps {
  activeTab: "trades" | "disputes" | "streams";
  filters: AdminDashboardFilters;
}

/**
 * Tab navigation and view container for analytics dashboard.
 *
 * Switches between three entity types with independent error handling.
 * Each view handles its own data fetching and error states, allowing
 * graceful degradation if one entity's API becomes unavailable.
 */
export function AdminDashboardTabs({
  activeTab,
  filters,
}: AdminDashboardTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs = [
    { id: "trades", label: "Trades", icon: "📦" },
    { id: "disputes", label: "Disputes", icon: "⚠️" },
    { id: "streams", label: "Streams", icon: "💰" },
  ] as const;

  const handleTabChange = (tabId: "trades" | "disputes" | "streams") => {
    const params = new URLSearchParams(searchParams);
    params.set("view", tabId);
    router.push(`/admin/dashboard?${params.toString()}`);
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-border-default">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-3 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
              activeTab === tab.id
                ? "text-gold border-b-2 border-gold"
                : "text-text-secondary hover:text-text-primary"
            }`}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content - Each view handles its own loading/error states */}
      <div className="min-h-96">
        {activeTab === "trades" && <AdminTradesView filters={filters} />}
        {activeTab === "disputes" && <AdminDisputesView filters={filters} />}
        {activeTab === "streams" && <AdminStreamsView filters={filters} />}
      </div>
    </div>
  );
}
