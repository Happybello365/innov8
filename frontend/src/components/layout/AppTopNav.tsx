"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/ui/Navigation";
import { Badge } from "@/components/ui/Badge";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNotificationStore } from "@/stores/notificationStore";

interface AppTopNavProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

// #445 — include Trades so the canonical shell highlights the active route;
// this eliminates the need for a redundant page-level title that duplicated
// the navigation context.
const TOP_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/assets", label: "Assets" },
  { href: "/vault", label: "Vault" },
  { href: "/help", label: "Help" },
];

export function AppTopNav({
  onToggleSidebar,
  isSidebarOpen,
}: AppTopNavProps) {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, fetch: fetchNotifications, markRead } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  async function handleMarkRead(id: string) {
    const prev = useNotificationStore.getState().unreadCount;
    useNotificationStore.setState((s) => ({
      notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
      unreadCount: s.notifications.filter((n) => !n.read && n.id !== id).length,
    }));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      useNotificationStore.setState((s) => ({
        notifications: s.notifications.map((n) => n.id === id ? { ...n, read: false } : n),
        unreadCount: prev,
      }));
    }
  }

  return (
    <header className="h-14 bg-card border-b border-border-default flex items-center px-4 lg:px-6 gap-4 lg:gap-8 flex-shrink-0">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-elevated transition-all"
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          {isSidebarOpen ? (
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          ) : (
            <path
              fillRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          )}
        </svg>
      </button>

      {/* Logo */}
      <Link href="/" aria-label="innov8 home" className="text-gold font-bold text-lg tracking-tight flex-shrink-0">
        innov8
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {TOP_NAV.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <NavLink key={item.href} href={item.href} isActive={isActive}>
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        {/* Admin role indicator */}
        {isAdmin && (
          <Badge variant="locked" size="sm">
            Admin
          </Badge>
        )}

        {/* Notification bell */}
        <div ref={dropdownRef} className="relative">
          <button
            aria-label="Notifications"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((o) => !o)}
            className="relative w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-elevated transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 1a5 5 0 015 5v3l1.5 2.5H1.5L3 9V6a5 5 0 015-5z" />
              <path d="M6.5 13.5a1.5 1.5 0 003 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-status-error text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-10 w-80 bg-card border border-border-default rounded-xl shadow-lg z-50 overflow-hidden" data-testid="notification-dropdown">
              <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-xs text-text-secondary">{unreadCount} unread</span>
                )}
              </div>
              <ul className="max-h-72 overflow-y-auto divide-y divide-border-default">
                {notifications.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-text-secondary">No notifications</li>
                ) : (
                  notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 ${n.read ? "opacity-60" : "bg-bg-elevated/40"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{n.title}</p>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      {!n.read && (
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          className="flex-shrink-0 text-xs text-gold hover:underline whitespace-nowrap mt-0.5"
                          aria-label={`Mark "${n.title}" as read`}
                        >
                          Mark read
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Avatar */}
        <button className="w-8 h-8 rounded-full bg-elevated border border-border-default flex items-center justify-center text-text-secondary hover:text-text-primary transition-all">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="8" cy="5" r="3" />
            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          </svg>
        </button>
      </div>
    </header>
  );
}
