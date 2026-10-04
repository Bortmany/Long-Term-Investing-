import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChartLine, ChevronRight } from "lucide-react";
import { MARKET_VALUES } from "@/lib/markets";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPriceHistory, getQuote } from "@/lib/data";
import {
  badgePropsForPrice,
  badgePropsForValueSource,
  SourceBadge,
} from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { ExplainerTip } from "@/components/explainer-tip";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveRows } from "@/components/ui/responsive-rows";
import { RowCard, ROW_CARD_LINK } from "@/components/ui/row-card";
import {
  CARD_LINK_TAP_AREA,
  TABLE_ROW_LINK,
  TABLE_ROW_LINKED,
  TABLE_ROW_RAISED,
} from "@/components/ui/row-link";
import { TrackStockDialog } from "@/components/stocks/track-stock-dialog";
import { WatchToggleButton } from "@/components/stocks/watch-toggle-button";
import type { StockListRow } from "@/components/stocks/types";
import { computeChangePercent } from "@/lib/stocks/ratios";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  buildStockSearchWhere,
  normalizeSearchQuery,
  SEARCH_MAX_RESULTS,
} from "@/lib/stocks/catalogue-search";
import {
  StockSearchBox,
  StockSearchResults,
  type StockSearchRow,
} from "@/components/stocks/stock-search";

export const metadata = { title: "Stocks — InvestIQ AI" };

// A short lookback is enough for a "change" figure and keeps this list page
// cheap — the full 1-year chart range lives only on /stocks/[id], which
// needs it anyway for the price-history chart.
const CHANGE_LOOKBACK_DAYS = 14;

/** Green for gains, red for losses — a genuine return figure (ui-spec §2.6). */
function changeColor(percent: number): string {
  if (percent > 0) return "text-green-600 dark:text-green-400";
  if (percent < 0) return "text-red-600 dark:text-red-400";
  return "";
}

/**
 * The quote, with its source badge — or the honest amber words when there is
 * no price. Same in the table and the phone card (golden rule: never a made-up
 * number).
 */
function QuoteFigure({
  row,
  large = false,
}: {
  row: StockListRow;
  large?: boolean;
}) {
  if (!row.quote.ok) {
    return (
      <span className="text-sm text-amber-700 dark:text-amber-400">
        Unavailable — no price
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span data-figure className={`tabular-nums ${large ? "text-base" : ""}`}>
        {formatMoney(row.quote.value, row.quote.currency)}
      </span>
      <span className={TABLE_ROW_RAISED}>
        <SourceBadge size="sm" {...row.quote.badge} />
      </span>
    </span>
  );
}

/** The change since the lookback start, green or red, with its badge — or a dash. */
function ChangeFigure({
  row,
  align = "start",
}: {
  row: StockListRow;
  align?: "start" | "end";
}) {
  if (!row.change.ok) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span
      data-figure
      className={`inline-flex items-center gap-1.5 text-sm tabular-nums ${align === "end" ? "justify-end" : ""} ${changeColor(row.change.percent)}`}
    >
      {formatPercent(row.change.percent, { signed: true })}
      <span className={TABLE_ROW_RAISED}>
        <SourceBadge size="sm" {...row.change.badge} />
      </span>
    </span>
  );
}

// /stocks — every instrument worth watching (held or explicitly tracked) in
// one table, the jump-off point to each stock's detail page. Everything is
// loaded server-side, scoped to the signed-in user; the golden rule applies
// to every quote/change figure (typed unavailable, never a fake number).
export default async function StocksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const markets = [...MARKET_VALUES];

  const [portfolio, watchlistRows] = await Promise.all([
    prisma.portfolio.findFirst({
      where: { userId },
      // Oldest portfolio, matching getOrCreatePortfolio and the dashboard.
      orderBy: { createdAt: "asc" },
    }),
    prisma.watchlistItem.findMany({ where: { userId } }),
  ]);

  const heldIds = new Set<string>();
  if (portfolio) {
    const heldTransactions = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id, instrumentId: { not: null } },
      select: { instrumentId: true },
    });
    for (const t of heldTransactions) {
      if (t.instrumentId) heldIds.add(t.instrumentId);
    }
  }
  const watchedIds = new Set(watchlistRows.map((w) => w.instrumentId));
  const instrumentIds = [...new Set([...heldIds, ...watchedIds])];
  const query = normalizeSearchQuery((await searchParams).q);

  // Search: the public list plus THIS user's own held/watched stocks, matched
  // on ticker or name. No quotes are fetched, so a search never calls a price
  // provider. Other people's typed-in tickers are never in scope.
  if (query) {
    const found = await prisma.instrument.findMany({
      where: buildStockSearchWhere(query, instrumentIds),
      orderBy: { ticker: "asc" },
      take: SEARCH_MAX_RESULTS,
    });
    const searchRows: StockSearchRow[] = found.map((instrument) => ({
      instrumentId: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      market: instrument.market,
      held: heldIds.has(instrument.id),
      watched: watchedIds.has(instrument.id),
    }));
    return (
      <>
        <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Stocks</h1>
          <TrackStockDialog markets={markets} />
        </div>
        <StockSearchBox query={query} />
        <StockSearchResults rows={searchRows} query={query} />
      </>
    );
  }

  // Zero held + zero watched: the whole page is one empty state (same
  // pattern as /portfolio's zero-transactions case).
  if (instrumentIds.length === 0) {
    return (
      <>
        <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Stocks</h1>
          <TrackStockDialog markets={markets} />
        </div>
        <StockSearchBox query={null} />
        <EmptyState
          icon={ChartLine}
          heading="No stocks yet"
          headingLevel={2}
          sentence="Search for a stock above, or use Track a Stock. Anything you hold or watch will show up here."
          className="min-h-48"
        />
      </>
    );
  }

  const instruments = await prisma.instrument.findMany({
    where: { id: { in: instrumentIds } },
    orderBy: { ticker: "asc" },
  });

  const now = new Date();
  const changeFrom = new Date(
    now.getTime() - CHANGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows: StockListRow[] = await Promise.all(
    instruments.map(async (instrument) => {
      const ref = {
        id: instrument.id,
        ticker: instrument.ticker,
        market: instrument.market,
        currency: instrument.currency,
      };
      const [quoteResult, historyResult] = await Promise.all([
        getQuote(ref),
        getPriceHistory(ref, { from: changeFrom, to: now }),
      ]);

      const quote: StockListRow["quote"] = quoteResult.ok
        ? {
            ok: true,
            value: quoteResult.data.price,
            currency: quoteResult.data.currency,
            badge: badgePropsForPrice(quoteResult.data, instrument.market),
          }
        : { ok: false };

      let change: StockListRow["change"] = { ok: false };
      if (historyResult.ok) {
        const changeResult = computeChangePercent(historyResult.data);
        if (changeResult.ok) {
          const sorted = [...historyResult.data].sort(
            (a, b) => a.date.getTime() - b.date.getTime(),
          );
          const latestPoint = sorted[sorted.length - 1];
          change = {
            ok: true,
            percent: changeResult.value,
            badge: badgePropsForValueSource({
              kind: latestPoint.source,
              asOf: latestPoint.date,
            }),
          };
        }
      }

      return {
        instrumentId: instrument.id,
        ticker: instrument.ticker,
        name: instrument.name,
        market: instrument.market,
        quote,
        change,
        held: heldIds.has(instrument.id),
        watched: watchedIds.has(instrument.id),
      };
    }),
  );

  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Stocks</h1>
        <TrackStockDialog markets={markets} />
      </div>
      <StockSearchBox query={null} />

      <ResponsiveRows
        listLabel="Stocks"
        cards={rows.map((row) => (
          <RowCard
            key={row.instrumentId}
            chevron
            identity={
              <>
                <Link
                  href={`/stocks/${row.instrumentId}`}
                  className={`${ROW_CARD_LINK} ${CARD_LINK_TAP_AREA}`}
                >
                  {row.ticker}
                </Link>
                {row.held ? <Badge variant="secondary">Held</Badge> : null}
              </>
            }
            name={row.name}
            headline={
              <>
                <QuoteFigure row={row} large />
                <ChangeFigure row={row} />
              </>
            }
            action={
              <WatchToggleButton
                instrumentId={row.instrumentId}
                initialWatched={row.watched}
                ticker={row.ticker}
              />
            }
          />
        ))}
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quote</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Change <ExplainerTip term="day-change" />
                  </span>
                </TableHead>
                <TableHead>Held</TableHead>
                <TableHead>
                  <span className="sr-only">Watch</span>
                </TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.instrumentId}
                  className={`${TABLE_ROW_LINKED} h-14`}
                >
                  <TableCell>
                    <Link
                      href={`/stocks/${row.instrumentId}`}
                      className={TABLE_ROW_LINK}
                    >
                      {row.ticker}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal break-words text-slate-600 dark:text-slate-400">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right">
                    <QuoteFigure row={row} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ChangeFigure row={row} align="end" />
                  </TableCell>
                  <TableCell>
                    {row.held ? <Badge variant="secondary">Held</Badge> : null}
                  </TableCell>
                  <TableCell>
                    <div className={TABLE_ROW_RAISED}>
                      <WatchToggleButton
                        instrumentId={row.instrumentId}
                        initialWatched={row.watched}
                        ticker={row.ticker}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 text-slate-400"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
    </>
  );
}
