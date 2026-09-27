import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChartLine } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDividendHistory,
  getFinancialStatements,
  getPriceHistory,
  getQuote,
  getUpcomingDividends,
  type Unavailable,
} from "@/lib/data";
import { getAiClient } from "@/lib/ai/client";
import { newsSummarySchema, stockScoreSchema } from "@/lib/ai/schemas";
import {
  badgePropsForValueSource,
  SourceBadge,
} from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WatchToggleButton } from "@/components/stocks/watch-toggle-button";
import { FinancialStatementsCard } from "@/components/stocks/financial-statements-card";
import { NewsSummaryCard } from "@/components/stocks/news-summary-card";
import { RatioStrip } from "@/components/stocks/ratio-strip";
import { StockScorePanel } from "@/components/stocks/stock-score-panel";
import type {
  DividendHistoryRow,
  RatioTile,
  StatementBlock,
  UpcomingDividendRow,
} from "@/components/stocks/types";
import { buildStatementTable } from "@/lib/stocks/statement-table";
import {
  computeChangePercent,
  computeCurrentRatio,
  computeDebtToEquity,
  computeDividendYield,
  computePriceToBook,
  computePriceToEarnings,
  computeReturnOnEquity,
  latestStatementRow,
  oneYearRange,
  sumTrailingDividendsPerShare,
} from "@/lib/stocks/ratios";
import { formatMoney, formatPercent, formatShortDate } from "@/lib/format";

// The price-history chart is recharts, lazy-loaded so it never blocks first
// paint (same pattern as the Dashboard's donuts/bar chart).
const PriceHistoryChart = dynamic(
  () => import("@/components/stocks/price-history-chart"),
  {
    loading: () => <Skeleton className="h-[280px] w-full" />,
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const instrument = await prisma.instrument.findUnique({ where: { id } });
  return {
    title: instrument
      ? `${instrument.ticker} — InvestIQ AI`
      : "Stock — InvestIQ AI",
  };
}

/** ui-spec §4.2's fixed copy for a market-data block that can't run for this instrument. */
function statementUnavailableMessage(result: Unavailable): string {
  if (result.unavailable === "not_supported") {
    return "Financial statements require a live market-data connection for this instrument.";
  }
  return result.message ?? "Financial statements are unavailable right now.";
}

function dividendUnavailableMessage(result: Unavailable): string {
  if (result.unavailable === "not_supported") {
    return "Dividend history requires a live market-data connection for this instrument.";
  }
  return result.message ?? "Dividend history is unavailable right now.";
}

function upcomingUnavailableMessage(result: Unavailable): string {
  if (result.unavailable === "not_supported") {
    return "Upcoming dividends require a live market-data connection for this instrument.";
  }
  return result.message ?? "Upcoming dividends are unavailable right now.";
}

/** Green for gains, red for losses — a genuine return figure (ui-spec §2.6). */
function changeColor(percent: number): string {
  if (percent > 0) return "text-green-600 dark:text-green-400";
  if (percent < 0) return "text-red-600 dark:text-red-400";
  return "";
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const { id } = await params;

  const instrument = await prisma.instrument.findUnique({ where: { id } });

  // Never a fabricated page for a stock that doesn't exist — an honest
  // message with a way back, still inside the app shell.
  if (!instrument) {
    return (
      <EmptyState
        icon={ChartLine}
        heading="Stock not found"
        sentence="This stock doesn't exist or has been removed."
        action={
          <Button asChild>
            <Link href="/stocks">Back to Stocks</Link>
          </Button>
        }
      />
    );
  }

  const ref = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };
  const now = new Date();
  const range = oneYearRange(now);

  const [
    watchlistItem,
    quoteResult,
    historyResult,
    incomeResult,
    balanceResult,
    cashFlowResult,
    dividendResult,
    upcomingResult,
    storedAnalysis,
    storedNewsAnalysis,
  ] = await Promise.all([
    prisma.watchlistItem.findUnique({
      where: { userId_instrumentId: { userId, instrumentId: instrument.id } },
    }),
    getQuote(ref),
    getPriceHistory(ref, range),
    getFinancialStatements(ref, "income", "annual"),
    getFinancialStatements(ref, "balance", "annual"),
    getFinancialStatements(ref, "cash-flow", "annual"),
    getDividendHistory(ref),
    getUpcomingDividends(ref),
    prisma.aiAnalysis.findFirst({
      where: {
        userId,
        type: "STOCK_SCORE",
        subjectType: "instrument",
        subjectId: instrument.id,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiAnalysis.findFirst({
      where: {
        userId,
        type: "NEWS_SUMMARY",
        subjectType: "instrument",
        subjectId: instrument.id,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const hasAiKey = getAiClient().ok;
  let stockScoreOutput = null;
  if (storedAnalysis) {
    const parsed = stockScoreSchema.safeParse(storedAnalysis.output);
    if (parsed.success) stockScoreOutput = parsed.data;
  }
  const stockScoreAnalysis =
    storedAnalysis && stockScoreOutput
      ? {
          createdAt: storedAnalysis.createdAt,
          model: storedAnalysis.model,
          dataAsOf: storedAnalysis.dataAsOf,
        }
      : null;

  let newsSummaryOutput = null;
  if (storedNewsAnalysis) {
    const parsed = newsSummarySchema.safeParse(storedNewsAnalysis.output);
    if (parsed.success) newsSummaryOutput = parsed.data;
  }
  const newsSummaryAnalysis =
    storedNewsAnalysis && newsSummaryOutput
      ? {
          createdAt: storedNewsAnalysis.createdAt,
          model: storedNewsAnalysis.model,
          dataAsOf: storedNewsAnalysis.dataAsOf,
        }
      : null;

  // --- Price + day change -----------------------------------------------
  const sortedPoints = historyResult.ok
    ? [...historyResult.data].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      )
    : [];
  const changeResult = computeChangePercent(sortedPoints);
  const latestPoint = sortedPoints[sortedPoints.length - 1];

  // --- Ratios (each derived independently — see src/lib/stocks/ratios.ts) --
  const price = quoteResult.ok ? quoteResult.data.price : null;
  const income = incomeResult.ok
    ? latestStatementRow(incomeResult.data.rows)
    : undefined;
  const balance = balanceResult.ok
    ? latestStatementRow(balanceResult.data.rows)
    : undefined;
  const trailingDividendPerShare = dividendResult.ok
    ? sumTrailingDividendsPerShare(dividendResult.data, now)
    : null;

  const ratioTiles: RatioTile[] = [
    {
      label: "P/E",
      result: computePriceToEarnings(price, income),
      kind: "multiple",
      term: "pe-ratio",
    },
    {
      label: "P/B",
      result: computePriceToBook(price, income, balance),
      kind: "multiple",
      term: "pb-ratio",
    },
    {
      label: "Dividend Yield",
      result: computeDividendYield(price, trailingDividendPerShare),
      kind: "percent",
      term: "dividend-yield",
    },
    {
      label: "Debt/Equity",
      result: computeDebtToEquity(balance),
      kind: "multiple",
      term: "debt-to-equity",
    },
    {
      label: "ROE",
      result: computeReturnOnEquity(income, balance),
      kind: "percent",
      term: "roe",
    },
    {
      label: "Current Ratio",
      result: computeCurrentRatio(balance),
      kind: "multiple",
      term: "current-ratio",
    },
  ];

  // --- Financial statements card -------------------------------------------
  function toBlock(
    result: typeof incomeResult,
    kind: "income" | "balance" | "cash-flow",
  ): StatementBlock {
    if (!result.ok) {
      return { ok: false, message: statementUnavailableMessage(result) };
    }
    return {
      ok: true,
      badge: badgePropsForValueSource({
        kind: result.data.source,
        asOf: result.data.asOf,
      }),
      table: buildStatementTable(kind, result.data.rows),
    };
  }
  const statementBlocks = {
    income: toBlock(incomeResult, "income"),
    balance: toBlock(balanceResult, "balance"),
    cashFlow: toBlock(cashFlowResult, "cash-flow"),
  };

  // --- Dividends ------------------------------------------------------------
  const dividendRows: DividendHistoryRow[] = dividendResult.ok
    ? [...dividendResult.data]
        .sort((a, b) => b.exDate.getTime() - a.exDate.getTime())
        .map((d) => ({
          exDate: d.exDate,
          amountPerShare: d.amountPerShare,
          currency: d.currency,
          badge: badgePropsForValueSource({ kind: d.source, asOf: d.exDate }),
        }))
    : [];
  const upcomingRows: UpcomingDividendRow[] = upcomingResult.ok
    ? [...upcomingResult.data]
        .sort((a, b) => a.exDate.getTime() - b.exDate.getTime())
        .map((d) => ({
          exDate: d.exDate,
          amountPerShare: d.amountPerShare,
          currency: d.currency,
          badge: badgePropsForValueSource({ kind: d.source, asOf: d.exDate }),
        }))
    : [];

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">
            {instrument.ticker}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            {instrument.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{instrument.market}</Badge>
            {instrument.sector ? (
              <Badge variant="secondary">{instrument.sector}</Badge>
            ) : null}
            {instrument.country ? (
              <Badge variant="secondary">{instrument.country}</Badge>
            ) : null}
          </div>
        </div>
        <div className="sm:text-right">
          {quoteResult.ok ? (
            <div className="flex items-baseline gap-2 sm:justify-end">
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(quoteResult.data.price, quoteResult.data.currency)}
              </span>
              {changeResult.ok ? (
                <span
                  className={`text-sm font-medium ${changeColor(changeResult.value)}`}
                >
                  {formatPercent(changeResult.value, { signed: true })}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Unavailable — no price
            </p>
          )}
          <div className="mt-1 sm:flex sm:justify-end">
            {quoteResult.ok ? (
              <SourceBadge
                {...badgePropsForValueSource({
                  kind: quoteResult.data.source,
                  asOf: quoteResult.data.asOf,
                })}
              />
            ) : null}
          </div>
        </div>
      </div>

      <WatchToggleButton
        instrumentId={instrument.id}
        initialWatched={Boolean(watchlistItem)}
        ticker={instrument.ticker}
        size="sm"
      />

      {/* Price history */}
      <Card className="gap-4">
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle>Price History</CardTitle>
          {historyResult.ok && latestPoint ? (
            <SourceBadge
              {...badgePropsForValueSource({
                kind: latestPoint.source,
                asOf: latestPoint.date,
              })}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {historyResult.ok && sortedPoints.length > 0 ? (
            <PriceHistoryChart
              points={sortedPoints}
              currency={instrument.currency}
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Price history unavailable.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Financial statements */}
      <FinancialStatementsCard
        income={statementBlocks.income}
        balance={statementBlocks.balance}
        cashFlow={statementBlocks.cashFlow}
      />

      {/* Ratio strip */}
      <RatioStrip tiles={ratioTiles} />

      {/* Dividends */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Dividends</CardTitle>
        </CardHeader>
        <CardContent>
          {!dividendResult.ok ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {dividendUnavailableMessage(dividendResult)}
            </p>
          ) : dividendRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No dividend history for this instrument.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ex-date</TableHead>
                  <TableHead className="text-right">Amount per share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividendRows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{formatShortDate(row.exDate)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className="tabular-nums">
                          {formatMoney(row.amountPerShare, row.currency)}
                        </span>
                        <SourceBadge size="sm" {...row.badge} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Upcoming</h3>
            {!upcomingResult.ok ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {upcomingUnavailableMessage(upcomingResult)}
              </p>
            ) : upcomingRows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No upcoming dividends found.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {upcomingRows.map((row, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatShortDate(row.exDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      {row.amountPerShare === null ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          Amount not yet announced
                        </span>
                      ) : (
                        formatMoney(row.amountPerShare, row.currency)
                      )}
                      <SourceBadge size="sm" {...row.badge} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Health Score */}
      <StockScorePanel
        instrumentId={instrument.id}
        hasKey={hasAiKey}
        analysis={stockScoreAnalysis}
        output={stockScoreOutput}
      />

      {/* Recent News */}
      <NewsSummaryCard
        instrumentId={instrument.id}
        hasKey={hasAiKey}
        analysis={newsSummaryAnalysis}
        output={newsSummaryOutput}
      />
    </div>
  );
}
