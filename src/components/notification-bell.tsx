"use client";

// The notification bell, rendered in the app shell next to ThemeToggle
// (BUILD-PLAN.md Phase 7). Bell icon + unread badge (capped "9+"), a panel
// listing the latest notifications, click-to-mark-read (optimistic, same
// pattern as WatchToggleButton), "Mark all read", and a link to /watchlist
// to manage the alerts themselves. Built on the shared DropdownMenu shell
// (open/close, outside-click, Escape) with fully custom content — the rows
// here aren't DropdownMenuItems because clicking one must NOT close the panel.
import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { Currency, PriceSource } from "@prisma/client";

import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SourceBadge, type SourceBadgeVariant } from "@/components/source-badge";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Plain, serializable shape the server layout hands down — Decimal already converted to number. */
export type NotificationBellItem = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  priceAtTrigger: number | null;
  priceCurrency: Currency | null;
  priceSource: PriceSource | null;
  priceAsOf: Date | null;
};

/**
 * The reverse of src/lib/data's badgeForPriceSource. "SEED" is handled only
 * for type completeness — the alert engine can never actually write it (see
 * the guarantee in src/lib/alerts/evaluate.ts): an alert never fires on
 * sample data, so a stored Notification's priceSource is always FMP/MANUAL.
 */
function badgeVariantForPriceSource(source: PriceSource): SourceBadgeVariant {
  switch (source) {
    case "FMP":
      return "live";
    case "MANUAL":
      return "manual";
    case "SEED":
      return "sample";
  }
}

export function NotificationBell({
  initialUnreadCount,
  initialItems,
  align = "end",
}: {
  initialUnreadCount: number;
  initialItems: NotificationBellItem[];
  /**
   * Passed straight through to DropdownMenuContent. The app shell renders
   * this same component in three places (desktop sidebar, tablet rail,
   * mobile top bar) at different edges of the screen, so it can't have one
   * hardcoded alignment — see app-shell.tsx.
   */
  align?: "start" | "end";
}) {
  const [items, setItems] = React.useState(initialItems);
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount);
  const [, startTransition] = React.useTransition();

  function handleMarkRead(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item || item.readAt) return;
    // Optimistic — same pattern as WatchToggleButton; revert on failure.
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, readAt: new Date() } : i)));
    setUnreadCount((count) => Math.max(0, count - 1));
    startTransition(async () => {
      const result = await markNotificationRead(id);
      if (!result.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, readAt: null } : i)));
        setUnreadCount((count) => count + 1);
      }
    });
  }

  function handleMarkAllRead() {
    if (unreadCount === 0) return;
    const now = new Date();
    setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt: now })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <span className="relative inline-flex">
            <Bell className="size-5" aria-hidden="true" />
            {unreadCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white dark:bg-blue-500"
              >
                {badgeLabel}
              </span>
            ) : null}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-80 max-w-[calc(100vw-2rem)] py-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <span className="text-sm font-semibold">Notifications</span>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={handleMarkAllRead}
            className="text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-blue-400 dark:disabled:text-slate-600"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No notifications yet.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleMarkRead(item.id)}
                className={cn(
                  "block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800",
                  !item.readAt && "bg-blue-50/60 dark:bg-blue-950/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{item.title}</span>
                  {!item.readAt ? (
                    <span
                      aria-hidden="true"
                      className="mt-1 size-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-500"
                    />
                  ) : null}
                </div>
                <p className="mt-0.5 text-slate-600 dark:text-slate-400">{item.body}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <span>{formatShortDate(item.createdAt)}</span>
                  {item.priceSource && item.priceAtTrigger !== null && item.priceCurrency ? (
                    <SourceBadge
                      size="sm"
                      variant={badgeVariantForPriceSource(item.priceSource)}
                      date={item.priceAsOf ? formatShortDate(item.priceAsOf) : undefined}
                    />
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-800">
          <Link href="/watchlist" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            Manage alerts
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
