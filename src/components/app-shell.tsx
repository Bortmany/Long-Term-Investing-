"use client";

// App shell (UI spec §2): persistent navigation around every authenticated
// page. Three breakpoints:
//   desktop (≥1024px) — 240px sidebar with icon + label rows
//   tablet (768–1023px) — 64px icon-only rail with tooltips
//   mobile (<768px)   — 56px top bar + hamburger opening a Sheet drawer
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Briefcase,
  ChartLine,
  ClipboardCheck,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { signOutAction } from "@/app/actions/sign-out";
import { SourceBadgeLegend } from "@/components/source-badge-legend";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Note: this repo's lucide-react version dropped the old `LineChart` alias —
// `ChartLine` is the same glyph the spec asks for.
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/stocks", label: "Stocks", icon: ChartLine },
  { href: "/theses", label: "Theses", icon: BookOpen },
  { href: "/committee", label: "Committee", icon: Users },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

function initialsFromEmail(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  compact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** compact = icon-only (tablet rail); label revealed via tooltip. */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        compact && "justify-center px-0",
        active
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-blue-600 dark:bg-blue-500"
        />
      ) : null}
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </Link>
  );

  if (!compact) return link;

  return (
    <Tooltip className="w-full">
      <TooltipTrigger className="w-full [&>*]:w-full">{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The sidebar footer: notification bell + theme toggle, user row, sign out. */
function ShellFooter({
  email,
  compact,
  notificationBell,
}: {
  email: string;
  compact?: boolean;
  /** Already resolved for this placement's alignment — see AppShell. */
  notificationBell?: React.ReactNode;
}) {
  const signOutButton = (
    <form action={signOutAction} className={cn(compact ? "" : "w-full")}>
      <Button
        type="submit"
        variant="ghost"
        size={compact ? "icon" : "sm"}
        className={cn(
          "text-slate-600 dark:text-slate-400",
          !compact && "w-full min-h-11 justify-start gap-2 px-3",
        )}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {compact ? <span className="sr-only">Sign out</span> : "Sign out"}
      </Button>
    </form>
  );

  return (
    <div className={cn("flex flex-col gap-2 p-3", compact && "items-center")}>
      <Separator className="mb-1" />
      <div className={cn("flex items-center gap-1", compact && "flex-col")}>
        {notificationBell}
        <ThemeToggle />
      </div>
      <div className={cn("flex items-center gap-2 px-1", compact && "justify-center px-0")}>
        <Avatar>
          <AvatarFallback>{initialsFromEmail(email)}</AvatarFallback>
        </Avatar>
        {compact ? null : (
          <span className="min-w-0 truncate text-sm text-slate-600 dark:text-slate-400" title={email}>
            {email}
          </span>
        )}
      </div>
      {compact ? (
        <Tooltip>
          <TooltipTrigger>{signOutButton}</TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      ) : (
        signOutButton
      )}
    </div>
  );
}

export function AppShell({
  email,
  notificationBellSidebar,
  notificationBellMobile,
  children,
}: {
  email: string;
  /**
   * Optional — the server layout builds these from the signed-in user's
   * notifications (Phase 7). Two pre-built variants, not one node reused,
   * because the bell renders at different screen edges (desktop sidebar,
   * tablet rail vs. mobile top bar) and its dropdown panel must hang from
   * the matching side — "start" (left-0) near the sidebar's left edge,
   * "end" (right-0) near the mobile header's right edge — or a wide panel
   * renders mostly off-screen. (Plain nodes, not a function: this is a
   * Server Component prop, and functions can't cross that boundary.)
   */
  notificationBellSidebar?: React.ReactNode;
  notificationBellMobile?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The drawer closes on nav-link taps (onNavigate below), overlay clicks,
  // and Escape — no route-change effect needed.
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Desktop sidebar (labels) and tablet rail (icons only) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-slate-200 bg-slate-50 md:flex lg:w-60 dark:border-slate-800 dark:bg-slate-900">
        <div className="px-4 py-4">
          <Link href="/dashboard" className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="hidden text-lg font-semibold lg:block">InvestIQ AI</span>
            <span className="block text-center text-lg font-semibold lg:hidden" aria-label="InvestIQ AI">
              IQ
            </span>
          </Link>
        </div>
        {/* Tablet rail: compact icon links with tooltips */}
        <nav className="flex flex-1 flex-col gap-1 px-2 lg:hidden" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} compact />
          ))}
        </nav>
        {/* Desktop: full rows with labels */}
        <nav className="hidden flex-1 flex-col gap-1 px-2 lg:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="mt-auto lg:hidden">
          <ShellFooter email={email} compact notificationBell={notificationBellSidebar} />
        </div>
        <div className="mt-auto hidden lg:block">
          <ShellFooter email={email} notificationBell={notificationBellSidebar} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-2 md:hidden dark:border-slate-800 dark:bg-slate-950">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </Button>
        <span className="text-lg font-semibold">InvestIQ AI</span>
        <div className="ml-auto flex items-center gap-1">
          {notificationBellMobile}
          <ThemeToggle placement="topbar" />
        </div>
      </header>

      {/* Mobile drawer — full nav content reused from the desktop sidebar */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="bg-slate-50 dark:bg-slate-900">
          <SheetHeader>
            <SheetTitle>InvestIQ AI</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onNavigate={() => setDrawerOpen(false)}
              />
            ))}
          </nav>
          <div className="mt-auto">
            <ShellFooter email={email} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Page content */}
      <main className="min-h-screen md:pl-16 lg:pl-60">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">{children}</div>
        {/* Persistent disclaimer shown under every authenticated page. */}
        <footer className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Analysis to support your own decisions — not financial advice.
            {" · "}
            <Link
              href="/privacy"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Privacy
            </Link>
            {" · "}
            <Link
              href="/terms"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Terms
            </Link>
          </p>
          {/* The key to the source badges that sit next to every number. */}
          <p className="mt-1 text-center">
            <SourceBadgeLegend />
          </p>
        </footer>
      </main>
    </div>
  );
}
