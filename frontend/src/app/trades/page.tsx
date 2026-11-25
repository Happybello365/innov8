"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics } from "@/components/AnalyticsProvider";
import { useToast } from "@/hooks/useToast";
import { api, ApiError, TradeResponse } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { NavButton } from "@/components/ui/Navigation";
import { VirtualizedList } from "@/components/ui/VirtualizedList";
import { Link2, Eye, Check } from "lucide-react";

type TradeStatus = "all" | "active" | "pending" | "completed" | "disputed";
type TradeDensity = "compact" | "comfortable";

const FILTERS: { label: string; value: TradeStatus }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Disputed", value: "disputed" },
];

const VALID_STATUSES: Set<string> = new Set([
  "all",
  "active",
  "pending",
  "completed",
  "disputed",
]);

const STATUS_STYLES: Record<string, string> = {
  active: "text-status-success bg-status-success/10 border border-status-success/20",
  pending: "text-status-warning bg-status-warning/10 border border-status-warning/20",
  completed: "text-text-secondary bg-surface-2 border border-border-default",
  disputed: "text-status-danger bg-status-danger/10 border border-status-danger/20",
  locked: "text-status-locked bg-status-locked/10 border border-status-locked/20",
  draft: "text-status-draft bg-surface-1 border border-border-default",
};

const DENSITY_STORAGE_KEY = "innov8-trade-list-density";
const PAGE_SIZE = 100;

function TradesTableSkeleton({ density }: { density: TradeDensity }) {
  const isCompact = density === "compact";
  return (
    <div className="rounded-lg border border-border-default overflow-hidden shadow-elev-1">
      <div className={`border-b border-border-default bg-surface-1 px-4 ${isCompact ? "py-2" : "py-3"}`}>
        <div className="grid grid-cols-6 gap-4">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <div className="divide-y divide-border-default bg-surface-0">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`grid grid-cols-6 gap-4 px-4 ${isCompact ? "py-2" : "py-4"}`}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TradesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { token, isAuthenticated } = useAuth();
  const { trackApiFailure, trackFunnelStep } = useAnalytics();
  const { addToast } = useToast();

  // Parse initial query params from URL
  const initialFilterParam = searchParams.get("status");
  const initialFilter: TradeStatus =
    initialFilterParam && VALID_STATUSES.has(initialFilterParam)
      ? (initialFilterParam as TradeStatus)
      : "all";

  const initialPageParam = searchParams.get("page");
  const parsedPage = initialPageParam ? parseInt(initialPageParam, 10) : 1;
  const initialPage = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [activeFilter, setActiveFilter] = useState<TradeStatus>(initialFilter);
  const [page, setPage] = useState(initialPage);
  const [density, setDensity] = useState<TradeDensity>("comfortable");
  const [trades, setTrades] = useState<TradeResponse[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Restore focus ref
  const lastActionElementRef = useRef<HTMLElement | null>(null);

  // Initialize and persist density preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (saved === "compact" || saved === "comfortable") {
        setDensity(saved);
      }
    } catch {
      // localStorage unavailable or restricted
    }
  }, []);

  const handleDensityChange = (newDensity: TradeDensity) => {
    setDensity(newDensity);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, newDensity);
    } catch {
      // localStorage unavailable
    }
  };

  // Sync state to URL parameters
  const updateUrl = useCallback(
    (newFilter: TradeStatus, newPage: number) => {
      const params = new URLSearchParams();
      if (newFilter !== "all") {
        params.set("status", newFilter);
      }
      if (newPage > 1) {
        params.set("page", String(newPage));
      }
      const qs = params.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router],
  );

  // Sync state when URL searchParams change externally (back/forward navigation)
  useEffect(() => {
    const filterParam = searchParams.get("status");
    const validFilter: TradeStatus =
      filterParam && VALID_STATUSES.has(filterParam)
        ? (filterParam as TradeStatus)
        : "all";

    const pageParam = searchParams.get("page");
    const num = pageParam ? parseInt(pageParam, 10) : 1;
    const validPage = !isNaN(num) && num > 0 ? num : 1;

    setActiveFilter(validFilter);
    setPage(validPage);
  }, [searchParams]);

  useEffect(() => {
    trackFunnelStep("trade_page_view", { filter: activeFilter });

    async function fetchTrades() {
      if (!isAuthenticated || !token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const statusParam = activeFilter === "all" ? undefined : activeFilter;
        const response = await api.trades.list(token, {
          status: statusParam,
          page,
          limit: PAGE_SIZE,
        });

        setTrades(response.items);
        setTotalPages(response.pagination.totalPages);
      } catch (err) {
        let errorMessage = "Failed to load trades";
        let status = 0;

        if (err instanceof ApiError) {
          errorMessage = err.message;
          status = err.status ?? 0;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }

        trackApiFailure("/trades", status, { message: errorMessage, filter: activeFilter });
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, [token, isAuthenticated, activeFilter, page, trackApiFailure, trackFunnelStep]);

  function handleFilter(value: TradeStatus) {
    setActiveFilter(value);
    setPage(1);
    updateUrl(value, 1);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    updateUrl(activeFilter, newPage);
  }

  const handleCopyLink = async (tradeId: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    lastActionElementRef.current = e.currentTarget as HTMLElement;
    const url = `${window.location.origin}/trades/${tradeId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(tradeId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(tradeId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatAddress(address: string) {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  const isCompact = density === "compact";
  const rowHeight = isCompact ? 40 : 56;

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="trades-page-container">
      {/* Shell header actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* Density preference controls */}
        <div
          className="flex items-center gap-1 bg-surface-1 p-1 rounded-lg border border-border-default"
          role="group"
          aria-label="Table density preference"
        >
          <button
            type="button"
            onClick={() => handleDensityChange("comfortable")}
            aria-pressed={density === "comfortable"}
            aria-label="Comfortable row density"
            title="Comfortable density"
            data-testid="density-comfortable-btn"
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              density === "comfortable"
                ? "bg-surface-2 text-text-primary shadow-elev-1"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2/60"
            }`}
          >
            Comfortable
          </button>
          <button
            type="button"
            onClick={() => handleDensityChange("compact")}
            aria-pressed={density === "compact"}
            aria-label="Compact row density"
            title="Compact density"
            data-testid="density-compact-btn"
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              density === "compact"
                ? "bg-surface-2 text-text-primary shadow-elev-1"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2/60"
            }`}
          >
            Compact
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 mr-2 border-r border-border-default pr-4">
            <button
              type="button"
              onClick={() => addToast({ type: "success", title: "Success", message: "Trade completed successfully!" })}
              className="px-3 py-1.5 rounded-md bg-status-success/10 border border-status-success/30 text-status-success text-xs font-medium hover:bg-status-success/20 transition-colors"
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => addToast({ type: "error", title: "Error", message: "Failed to complete trade." })}
              className="px-3 py-1.5 rounded-md bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs font-medium hover:bg-status-danger/20 transition-colors"
            >
              Error
            </button>
            <button
              type="button"
              onClick={() => addToast({ type: "warning", title: "Warning", message: "Trade is disputed." })}
              className="px-3 py-1.5 rounded-md bg-status-warning/10 border border-status-warning/30 text-status-warning text-xs font-medium hover:bg-status-warning/20 transition-colors"
            >
              Warning
            </button>
            <button
              type="button"
              onClick={() => addToast({ type: "info", title: "Info", message: "New message received." })}
              className="px-3 py-1.5 rounded-md bg-status-info/10 border border-status-info/30 text-status-info text-xs font-medium hover:bg-status-info/20 transition-colors"
            >
              Info
            </button>
          </div>
          <Link href="/trades/create">
            <Button variant="primary">Create Trade</Button>
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6" role="tablist" aria-label="Trade filters">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.value;

            return (
              <NavButton
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleFilter(filter.value)}
                isActive={isActive}
                data-testid={`filter-${filter.value}`}
              >
                {filter.label}
              </NavButton>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {loading && <TradesTableSkeleton density={density} />}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-status-danger/40 bg-status-danger/15 px-4 py-3 text-center">
          <p className="text-status-danger text-sm">{error}</p>
        </div>
      )}

      {/* Trade list */}
      {!loading && !error && (
        <>
          {trades.length === 0 ? (
            <div className="rounded-lg border border-border-default bg-surface-1 py-20 px-6 text-center shadow-elev-1">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-lg bg-surface-2 border border-border-default flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-text-primary mb-3">
                No trades yet
              </h3>

              <p className="text-text-secondary text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                Get started by creating your first trade to begin settling
                agricultural transactions securely on the blockchain.
              </p>

              <Link href="/trades/create">
                <Button variant="primary" size="lg">Create Your First Trade</Button>
              </Link>
            </div>
          ) : (
            <div
              className="rounded-lg border border-border-default overflow-hidden shadow-elev-1"
              data-density={density}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b border-border-default bg-surface-1 ${isCompact ? "py-2" : "py-3"}`}>
                    <th className="text-left px-4 py-2.5 text-text-muted font-medium">
                      ID
                    </th>
                    <th className="text-left px-4 py-2.5 text-text-muted font-medium">
                      Counterparty
                    </th>
                    <th className="text-left px-4 py-2.5 text-text-muted font-medium">
                      Amount
                    </th>
                    <th className="text-left px-4 py-2.5 text-text-muted font-medium">
                      Status
                    </th>
                    <th className="text-left px-4 py-2.5 text-text-muted font-medium">
                      Created
                    </th>
                    <th className="text-right px-4 py-2.5 text-text-muted font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
              </table>
              <VirtualizedList
                items={trades}
                rowHeight={rowHeight}
                maxHeight={Math.min(trades.length * rowHeight, 600)}
                keyExtractor={(trade) => trade.tradeId}
                renderItem={(trade, i) => (
                  <div
                    tabIndex={0}
                    role="row"
                    aria-label={`Trade ${trade.tradeId}, amount ${trade.amountCngn} cNGN, status ${trade.status}`}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        router.push(`/trades/${trade.tradeId}`);
                      }
                    }}
                    className={`grid grid-cols-6 gap-4 px-4 ${
                      isCompact ? "py-1.5 text-xs" : "py-3 text-sm"
                    } items-center border-b border-border-default last:border-0 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[-2px] ${
                      i % 2 === 0 ? "bg-surface-0" : "bg-surface-1"
                    }`}
                  >
                    <div className="text-gold font-mono truncate">
                      <Link
                        href={`/trades/${trade.tradeId}`}
                        className="hover:underline underline-offset-4"
                        tabIndex={-1}
                      >
                        {trade.tradeId.slice(0, 8)}...
                      </Link>
                    </div>
                    <div className="text-text-secondary font-mono truncate">
                      {formatAddress(trade.sellerAddress)}
                    </div>
                    <div className="text-text-primary font-medium truncate">
                      {trade.amountCngn} cNGN
                    </div>
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full ${
                          isCompact ? "text-[11px]" : "text-xs"
                        } font-medium capitalize ${
                          STATUS_STYLES[trade.status] ?? "text-text-muted"
                        }`}
                      >
                        {trade.status}
                      </span>
                    </div>
                    <div className="text-text-secondary truncate">
                      {formatDate(trade.createdAt)}
                    </div>
                    <div
                      className="flex items-center justify-end gap-1.5"
                      role="group"
                      aria-label={`Actions for trade ${trade.tradeId}`}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleCopyLink(trade.tradeId, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopyLink(trade.tradeId, e);
                          }
                        }}
                        aria-label={
                          copiedId === trade.tradeId
                            ? `Link copied for trade ${trade.tradeId}`
                            : `Copy link for trade ${trade.tradeId}`
                        }
                        title={copiedId === trade.tradeId ? "Copied!" : "Copy link"}
                        className={`p-1.5 rounded-md border border-border-default text-text-muted hover:border-border-hover hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-1`}
                      >
                        {copiedId === trade.tradeId ? (
                          <Check className="w-3.5 h-3.5 text-status-success" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Link
                        href={`/trades/${trade.tradeId}`}
                        aria-label={`View trade ${trade.tradeId}`}
                        title="View trade"
                        className="p-1.5 rounded-md border border-border-default text-text-muted hover:border-border-hover hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              />
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 text-sm text-text-secondary">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-md border border-border-default hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-md border border-border-default hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
