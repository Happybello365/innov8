"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useFreighterIdentity } from "@/hooks/useFreighterIdentity";
import { api, ApiError, DisputeResponse } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/SkeletonList";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { getMediatorAddresses, isMediatorAddress, formatDate, formatAddress } from "./helpers";
import { loadSavedViews, persistSavedViews, type SavedView, type DisputeStatus } from "./savedViewsHelpers";

const FILTERS: { label: string; value: DisputeStatus | "all" }[] = [
  { label: "All Active", value: "all" },
  { label: "Open", value: "OPEN" },
  { label: "Under Review", value: "UNDER_REVIEW" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
];

const STATUS_STYLES: Record<string, string> = {
  OPEN: "text-status-warning bg-status-warning/15",
  UNDER_REVIEW: "text-status-info bg-status-info/15",
  RESOLVED: "text-status-success bg-status-success/15",
  CLOSED: "text-text-secondary bg-bg-elevated",
};

const PAGE_SIZE = 10;

export default function MediatorDisputesPage() {
  const { token, isAuthenticated } = useAuth();
  const { address } = useFreighterIdentity();
  const [activeFilter, setActiveFilter] = useState<DisputeStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [disputes, setDisputes] = useState<DisputeResponse[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mediatorAddresses = useMemo(() => getMediatorAddresses(), []);
  const isMediator = isMediatorAddress(address, mediatorAddresses);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [newViewName, setNewViewName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    if (address) {
      setSavedViews(loadSavedViews(address));
    }
  }, [address]);

  function handleSaveView() {
    const name = newViewName.trim();
    if (!name || !address) return;
    const updated = [...savedViews.filter((v) => v.name !== name), { name, filter: activeFilter }];
    setSavedViews(updated);
    persistSavedViews(address, updated);
    setNewViewName("");
    setShowSaveInput(false);
  }

  function handleDeleteView(name: string) {
    if (!address) return;
    const updated = savedViews.filter((v) => v.name !== name);
    setSavedViews(updated);
    persistSavedViews(address, updated);
  }

  const fetchDisputes = useCallback(async () => {
    if (!isAuthenticated || !token || !isMediator) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const statusParam = activeFilter === "all" ? undefined : activeFilter;
      const response = await api.disputes.list(token, {
        status: statusParam,
        page,
        limit: PAGE_SIZE,
      });

      setDisputes(response.items);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      let errorMessage = "Unable to reach the server. Check your connection and try again.";
      if (err instanceof ApiError) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated, isMediator, activeFilter, page]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  function handleFilter(value: DisputeStatus | "all") {
    setActiveFilter(value);
    setPage(1);
  }

  if (!isMediator) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="mediator-disputes-page">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-4">Access Restricted</h1>
          <p className="text-text-secondary">
            This page is only accessible to authorized mediators.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="mediator-disputes-page">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Mediator Disputes</h1>
        </div>
        <SkeletonList rows={PAGE_SIZE} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="mediator-disputes-page">
        <ErrorState
          variant="card"
          title="Couldn't load disputes"
          message={error}
          onRetry={fetchDisputes}
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="mediator-disputes-page">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-text-primary">Mediator Disputes</h1>
      </div>

      {/* Filters */}
      <Tabs
        items={FILTERS}
        activeValue={activeFilter}
        onChange={handleFilter}
        className="mb-3"
      />

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="saved-views">
        {savedViews.map((view) => (
          <div key={view.name} className="flex items-center gap-1">
            <button
              onClick={() => handleFilter(view.filter)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === view.filter
                  ? "bg-gold text-text-inverse border-gold"
                  : "bg-bg-elevated text-text-secondary border-border-default hover:border-border-hover"
              }`}
            >
              {view.name}
            </button>
            <button
              onClick={() => handleDeleteView(view.name)}
              className="text-text-muted hover:text-status-error text-xs"
              aria-label={`Delete saved view "${view.name}"`}
            >
              ×
            </button>
          </div>
        ))}

        {showSaveInput ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveView(); if (e.key === "Escape") setShowSaveInput(false); }}
              placeholder="View name"
              className="px-2 py-1 text-xs rounded border border-border-default bg-bg-elevated text-text-primary outline-none focus:border-gold"
            />
            <Button size="sm" variant="primary" onClick={handleSaveView} disabled={!newViewName.trim()}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSaveInput(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setShowSaveInput(true)}>
            + Save view
          </Button>
        )}
      </div>

      {/* Disputes list */}
      <div className="space-y-4">
        {disputes.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            No disputes found
          </div>
        ) : (
          disputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/mediator/disputes/${dispute.tradeId}`}
              className="block p-6 bg-bg-elevated rounded-lg border border-border-default hover:border-border-hover transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-semibold text-text-primary">
                      Trade {dispute.tradeId}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[dispute.status]}`}
                    >
                      {dispute.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-sm text-text-secondary mb-2">
                    Initiated by: {formatAddress(dispute.initiator)}
                  </div>
                  <div className="text-sm text-text-secondary mb-2">
                    Buyer: {formatAddress(dispute.trade.buyerAddress)} | Seller: {formatAddress(dispute.trade.sellerAddress)}
                  </div>
                  <div className="text-sm text-text-secondary">
                    Amount: ${dispute.trade.amountUsdc} USDC
                  </div>
                  <div className="text-sm text-text-secondary mt-1">
                    Created: {formatDate(dispute.createdAt)}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="px-3 py-1 text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}