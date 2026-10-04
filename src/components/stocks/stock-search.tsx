// Search box and results for /stocks?q=. A plain GET form (a normal page
// load, so results can be shared and the back button works) — no script is
// needed for the box itself. Result rows show no price or change, so a search
// never calls a price provider.
import Link from "next/link";
import { ChevronRight, Search, SearchX, X } from "lucide-react";
import type { Market } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WatchToggleButton } from "@/components/stocks/watch-toggle-button";
import { marketLabel } from "@/lib/markets";
import {
  resultsLine,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MAX_RESULTS,
} from "@/lib/stocks/catalogue-search";

export type StockSearchRow = {
  instrumentId: string;
  ticker: string;
  name: string;
  market: Market;
  held: boolean;
  watched: boolean;
};

export function StockSearchBox({ query }: { query: string | null }) {
  return (
    <div className="mb-6">
      <form action="/stocks" method="get" role="search" className="flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            name="q"
            defaultValue={query ?? ""}
            maxLength={SEARCH_MAX_QUERY_LENGTH}
            placeholder="Search by name or ticker"
            aria-label="Search stocks"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-input bg-transparent pl-9 pr-11 text-base shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 md:text-sm"
          />
          {query ? (
            <Link
              href="/stocks"
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-50"
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
        <Button type="submit" variant="outline" size="lg" className="px-4" aria-label="Search">
          <Search aria-hidden="true" className="sm:hidden" />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </form>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Search covers InvestIQ&apos;s public list plus stocks you hold or watch.
      </p>
    </div>
  );
}

export function StockSearchResults({
  rows,
  query,
}: {
  rows: StockSearchRow[];
  query: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center text-center">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <SearchX aria-hidden="true" className="size-12 text-slate-400 dark:text-slate-500" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">No matching stocks</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Nothing matches &quot;{query}&quot;. Use Track a Stock to add one.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm" aria-live="polite">
          {resultsLine(rows.length, query)}
        </p>
        <Link
          href="/stocks"
          className="inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Clear search
        </Link>
      </div>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {rows.map((row) => (
          <li
            key={row.instrumentId}
            className="relative flex min-h-[72px] items-center gap-3 py-2 pl-1 hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/50 dark:active:bg-slate-800"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* The ticker is the one real link; its invisible layer covers the whole row. */}
                <Link
                  href={`/stocks/${row.instrumentId}`}
                  className="font-mono text-base font-semibold text-blue-600 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring dark:text-blue-400"
                >
                  {row.ticker}
                </Link>
                <Badge variant="secondary">{marketLabel(row.market)}</Badge>
                {row.held || row.watched ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {row.held ? "Held" : "Watching"}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm text-slate-600 dark:text-slate-400">{row.name}</p>
            </div>
            <div className="relative z-10">
              <WatchToggleButton
                instrumentId={row.instrumentId}
                initialWatched={row.watched}
                ticker={row.ticker}
              />
            </div>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
          </li>
        ))}
      </ul>
      {rows.length >= SEARCH_MAX_RESULTS ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Showing the first {SEARCH_MAX_RESULTS} matches. Type more to narrow it down.
        </p>
      ) : null}
    </div>
  );
}
