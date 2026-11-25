"use client";

import React, { useState, useRef, useEffect } from "react";
import { Eye, ArrowDownToLine, ArrowUpFromLine, Link2, Check } from "lucide-react";
import type { TradeStatus } from "@/types/trade";

export type TradeDensity = "compact" | "comfortable";

export interface TradeListItemProps {
  tradeId: string;
  commodity: string;
  counterparty: { role: string; address: string };
  amountCngn: string;
  status: TradeStatus;
  createdAt: string;
  density?: TradeDensity;
  onView: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  restoreFocusTrigger?: boolean;
}

const STATUS_STYLES: Record<TradeStatus, string> = {
  "IN TRANSIT": "bg-emerald-muted text-emerald border border-emerald/30",
  PENDING:
    "bg-status-warning/10 text-status-warning border border-status-warning/30",
  SETTLED: "bg-status-info/10 text-status-info border border-status-info/30",
  DISPUTED:
    "bg-status-danger/10 text-status-danger border border-status-danger/30",
  DRAFT: "bg-status-draft/10 text-status-draft border border-status-draft/30",
};

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TradeListItem({
  tradeId,
  commodity,
  counterparty,
  amountCngn,
  status,
  createdAt,
  density = "comfortable",
  onView,
  onDeposit,
  onWithdraw,
  restoreFocusTrigger,
}: TradeListItemProps) {
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES["DRAFT"];
  const [copied, setCopied] = useState(false);
  
  // Element refs for keyboard management & focus restoration
  const rowRef = useRef<HTMLDivElement>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const viewBtnRef = useRef<HTMLButtonElement>(null);
  const depositBtnRef = useRef<HTMLButtonElement>(null);
  const withdrawBtnRef = useRef<HTMLButtonElement>(null);
  const lastActiveActionRef = useRef<HTMLButtonElement | null>(null);

  // Restore focus if dialog closes
  useEffect(() => {
    if (restoreFocusTrigger && lastActiveActionRef.current) {
      lastActiveActionRef.current.focus();
    }
  }, [restoreFocusTrigger]);

  const handleCopyLink = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    lastActiveActionRef.current = copyBtnRef.current;
    const url = `${window.location.origin}/trades/${tradeId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // List of active action buttons for arrow key navigation
  const getActionButtons = () => {
    const buttons: (HTMLButtonElement | null)[] = [
      copyBtnRef.current,
      viewBtnRef.current,
      depositBtnRef.current,
      withdrawBtnRef.current,
    ];
    return buttons.filter((b): b is HTMLButtonElement => b !== null && !b.disabled);
  };

  const handleActionKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    actionFn?: () => void,
  ) => {
    const buttons = getActionButtons();
    const currentIndex = buttons.indexOf(e.currentTarget);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = (currentIndex + 1) % buttons.length;
      buttons[nextIndex]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[prevIndex]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      e.stopPropagation();
      buttons[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      buttons[buttons.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      rowRef.current?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      lastActiveActionRef.current = e.currentTarget;
      actionFn?.();
    }
  };

  const isCompact = density === "compact";

  return (
    <div
      ref={rowRef}
      onClick={onView}
      role="button"
      tabIndex={0}
      aria-label={`View trade ${tradeId} — ${commodity} ${amountCngn} cNGN, status ${status}`}
      onKeyDown={(e) => {
        if (e.target === rowRef.current) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onView();
          } else if (e.key === "ArrowRight") {
            const buttons = getActionButtons();
            if (buttons.length > 0) {
              e.preventDefault();
              buttons[0].focus();
            }
          }
        }
      }}
      className={`flex items-center justify-between ${
        isCompact ? "p-2.5 mb-2" : "p-4 mb-3"
      } bg-card border border-border-default rounded-lg hover:border-gold/30 hover:bg-elevated transition-colors cursor-pointer group focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2`}
      data-density={density}
    >
      {/* Left — commodity + meta */}
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className={`${
            isCompact ? "text-sm font-medium" : "text-lg font-medium"
          } text-text-primary truncate`}
        >
          {commodity}
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-white/5 text-teal text-xs px-2 py-0.5 rounded">
            {counterparty.role}
          </span>
          <span className="font-mono text-text-muted text-xs sm:text-sm">
            {truncateAddress(counterparty.address)}
          </span>
        </div>

        <span className="font-mono text-text-muted text-xs sm:text-sm">{tradeId}</span>
      </div>

      {/* Right — amount + status + actions */}
      <div
        className={`flex items-center ${isCompact ? "gap-2" : "gap-3"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hidden sm:flex flex-col items-end gap-1">
          <span className={`text-text-primary font-semibold ${isCompact ? "text-xs" : "text-sm"}`}>
            {amountCngn}{" "}
            <span className="text-text-muted font-normal">cNGN</span>
          </span>
          <span className="text-text-muted text-xs">{createdAt}</span>
        </div>

        <span
          className={`hidden sm:inline-flex items-center gap-1.5 ${
            isCompact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
          } rounded-full font-semibold tracking-wide ${statusStyle}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {status}
        </span>

        <div
          className={`flex items-center ${isCompact ? "gap-1.5" : "gap-3"}`}
          role="group"
          aria-label={`Row actions for trade ${tradeId}`}
        >
          <button
            ref={copyBtnRef}
            onClick={handleCopyLink}
            onKeyDown={(e) => handleActionKeyDown(e, () => handleCopyLink(e))}
            aria-label={copied ? `Link copied for trade ${tradeId}` : `Copy link to trade ${tradeId}`}
            title={copied ? "Link copied!" : "Copy link"}
            className={`${
              isCompact ? "p-1.5" : "p-2"
            } rounded-lg border border-border-default text-text-muted hover:border-border-hover hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2`}
          >
            {copied ? (
              <Check aria-hidden="true" className={isCompact ? "w-3.5 h-3.5 text-status-success" : "w-4 h-4 text-status-success"} />
            ) : (
              <Link2 aria-hidden="true" className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            )}
          </button>

          <button
            ref={viewBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              lastActiveActionRef.current = viewBtnRef.current;
              onView();
            }}
            onKeyDown={(e) =>
              handleActionKeyDown(e, () => {
                lastActiveActionRef.current = viewBtnRef.current;
                onView();
              })
            }
            aria-label={`View trade ${tradeId}`}
            title="View trade"
            className={`${
              isCompact ? "p-1.5" : "p-2"
            } rounded-lg border border-border-default text-text-muted hover:border-border-hover hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2`}
          >
            <Eye aria-hidden="true" className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>

          {onDeposit && (
            <button
              ref={depositBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                lastActiveActionRef.current = depositBtnRef.current;
                onDeposit();
              }}
              onKeyDown={(e) =>
                handleActionKeyDown(e, () => {
                  lastActiveActionRef.current = depositBtnRef.current;
                  onDeposit();
                })
              }
              aria-label={`Deposit for trade ${tradeId}`}
              title="Deposit"
              className={`${
                isCompact ? "p-1.5" : "p-2"
              } rounded-lg border border-border-default text-text-muted hover:border-emerald/40 hover:text-emerald transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2`}
            >
              <ArrowDownToLine aria-hidden="true" className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            </button>
          )}

          {onWithdraw && (
            <button
              ref={withdrawBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                lastActiveActionRef.current = withdrawBtnRef.current;
                onWithdraw();
              }}
              onKeyDown={(e) =>
                handleActionKeyDown(e, () => {
                  lastActiveActionRef.current = withdrawBtnRef.current;
                  onWithdraw();
                })
              }
              aria-label={`Withdraw for trade ${tradeId}`}
              title="Withdraw"
              className={`${
                isCompact ? "p-1.5" : "p-2"
              } rounded-lg border border-border-default text-text-muted hover:border-status-danger/40 hover:text-status-danger transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2`}
            >
              <ArrowUpFromLine aria-hidden="true" className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
