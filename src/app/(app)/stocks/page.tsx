import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChartLine } from "lucide-react";
import { Market } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPriceHistory, getQuote } from "@/lib/data";
import {
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
import { TrackStockDialog } from "@/components/stocks/track-stock-dialog";
import { WatchToggleButton } from "@/components/stocks/watch-toggle-button";
import type { StockListRow } from "@/components/stocks/types";
import { computeChangePercent } from "@/lib/stocks/ratios";
import { formatMoney, formatPercent } from "@/lib/format";

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

// /stocks — every instrument worth watching (held or explicitly tracked) in
// one table, the jump-off point to each stock's detail page. Everything is
// loaded server-side, scoped to the signed-in user; the golden rule applies
// to every quote/change figure (typed unavailable, never a fake number).
export default async function StocksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const markets = Object.values(Market);

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

  // Zero held + zero watched: the whole page is one empty state (same
  // pattern as /portfolio's zero-transactions case).
  if (instrumentIds.length === 0) {
    return (
      <EmptyState
        icon={ChartLine}
        heading="Stocks"
        sentence="Add a holding or track a stock to see it here."
        action={<TrackStockDialog markets={markets} />}
      />
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
            badge: badgePropsForValueSource({
              kind: quoteResult.data.source,
              asOf: quoteResult.data.asOf,
            }),
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.instrumentId}>
              <TableCell className="font-mono font-medium">
                <Link
                  href={`/stocks/${row.instrumentId}`}
                  className="hover:underline"
                >
                  {row.ticker}
                </Link>
              </TableCell>
              <TableCell className="text-slate-600 dark:text-slate-400">
                {row.name}
              </TableCell>
              <TableCell className="text-right">
                {row.quote.ok ? (
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span className="tabular-nums">
                      {formatMoney(row.quote.value, row.quote.currency)}
                    </span>
                    <SourceBadge size="sm" {...row.quote.badge} />
                  </span>
                ) : (
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    Unavailable — no price
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.change.ok ? (
                  <span
                    className={`inline-flex items-center justify-end gap-1.5 tabular-nums ${changeColor(row.change.percent)}`}
                  >
                    {formatPercent(row.change.percent, { signed: true })}
                    <SourceBadge size="sm" {...row.change.badge} />
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </TableCell>
              <TableCell>
                {row.held ? <Badge variant="secondary">Held</Badge> : null}
              </TableCell>
              <TableCell>
                <WatchToggleButton
                  instrumentId={row.instrumentId}
                  initialWatched={row.watched}
                  ticker={row.ticker}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
