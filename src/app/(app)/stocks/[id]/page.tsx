import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Newspaper } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnthropicKey } from "@/lib/ai/client";
import { stockScoreSchema, type StockScoreOutput } from "@/lib/ai/schemas";
import {
  getDividendHistory,
  getFinancialStatements,
  getPriceHistory,
  getProfile,
  getQuote,
  getUpcomingDividends,
  type FinancialStatements,
  type InstrumentRef,
  type PricePoint,
  type DataResult,
} from "@/lib/data";
import { deriveRatios, type RatioInputs } from "@/lib/stocks/ratios";
import { formatMoney, formatPercent, formatShortDate } from "@/lib/format";
import {
  badgePropsForValueSource,
  SourceBadge,
} from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { WatchStar } from "@/components/stocks/watch-star";
import { PriceHistoryChart } from "@/components/stocks/price-history-chart";
import { StatementsCard, type StatementTabData } from "@/components/stocks/statements-card";
import { HealthScorePanel } from "@/components/stocks/health-score-panel";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Pure extraction helpers (raw FMP statement rows → typed numbers). Kept local
// to the page; the ratio math itself lives in the pure src/lib/stocks/ratios.
// ---------------------------------------------------------------------------

function pickNumber(
  row: Record<string, unknown> | undefined,
  key: string,
): number | null {
  if (!row) return null;
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function periodLabel(row: Record<string, unknown>): string {
  const cy = row.calendarYear;
  if (typeof cy === "string" && cy.length > 0) return `FY${cy}`;
  if (typeof cy === "number") return `FY${cy}`;
  const date = row.date;
  if (typeof date === "string" && date.length >= 4) return `FY${date.slice(0, 4)}`;
  return "—";
}

/** The line items we surface per statement kind (ui-spec §4.2). */
const STATEMENT_FIELDS: Record<
  "income" | "balance" | "cash-flow",
  { key: string; label: string }[]
> = {
  income: [
    { key: "revenue", label: "Revenue" },
    { key: "costOfRevenue", label: "Cost of Revenue" },
    { key: "grossProfit", label: "Gross Profit" },
    { key: "operatingIncome", label: "Operating Income" },
    { key: "netIncome", label: "Net Income" },
    { key: "eps", label: "EPS" },
  ],
  balance: [
    { key: "totalAssets", label: "Total Assets" },
    { key: "totalLiabilities", label: "Total Liabilities" },
    { key: "totalStockholdersEquity", label: "Total Equity" },
    { key: "totalCurrentAssets", label: "Total Current Assets" },
    { key: "totalCurrentLiabilities", label: "Total Current Liabilities" },
    { key: "totalDebt", label: "Total Debt" },
  ],
  "cash-flow": [
    { key: "operatingCashFlow", label: "Operating Cash Flow" },
    { key: "freeCashFlow", label: "Free Cash Flow" },
    { key: "capitalExpenditure", label: "Capital Expenditure" },
    { key: "dividendsPaid", label: "Dividends Paid" },
  ],
};

function buildStatementTab(
  kind: "income" | "balance" | "cash-flow",
  result: DataResult<FinancialStatements>,
  fallbackCurrency: string,
): StatementTabData {
  if (!result.ok) return { ok: false };
  const rows = result.data.rows.slice(0, 5); // newest first, up to 5 years
  if (rows.length === 0) return { ok: false };

  const reported = rows[0]?.reportedCurrency;
  const currency = typeof reported === "string" ? reported : fallbackCurrency;
  const badge = badgePropsForValueSource({
    kind: result.data.source,
    asOf: result.data.asOf,
  });
  const periods = rows.map((row) => ({ label: periodLabel(row), badge }));

  const lineItems = STATEMENT_FIELDS[kind]
    .map((field) => ({
      label: field.label,
      values: rows.map((row) => pickNumber(row, field.key)),
    }))
    // Drop rows the payload doesn't carry at all (all cells missing) — no
    // point in a row of em dashes.
    .filter((item) => item.values.some((value) => value !== null));

  return { ok: true, currency, periods, rows: lineItems };
}

/** Trailing-12-month dividend per share, anchored to the latest payment. */
function trailingDividendPerShare(
  payments: { exDate: Date; amountPerShare: number }[],
): number | null {
  if (payments.length === 0) return null;
  const sorted = [...payments].sort(
    (a, b) => b.exDate.getTime() - a.exDate.getTime(),
  );
  const anchor = sorted[0].exDate.getTime();
  const cutoff = anchor - 365 * 24 * 60 * 60 * 1000;
  const total = sorted
    .filter((p) => p.exDate.getTime() > cutoff && p.exDate.getTime() <= anchor)
    .reduce((sum, p) => sum + p.amountPerShare, 0);
  return total;
}

/** Day change % from the two most recent closes; null when fewer than two. */
function dayChangeFromHistory(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  if (previous.close <= 0) return null;
  return ((latest.close - previous.close) / previous.close) * 100;
}

// ---------------------------------------------------------------------------
// The page (Next.js 16: dynamic route params are async)
// ---------------------------------------------------------------------------

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const instrument = await prisma.instrument.findUnique({ where: { id } });
  if (!instrument) {
    notFound();
  }

  const ref: InstrumentRef = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Everything below is a READ — no AI generation happens on render (AI rule).
  const [
    profileR,
    quoteR,
    historyR,
    incomeR,
    balanceR,
    cashR,
    dividendR,
    upcomingResult,
    watchItem,
    scoreRow,
  ] = await Promise.all([
    getProfile(ref),
    getQuote(ref),
    getPriceHistory(ref, { from: oneYearAgo, to: new Date() }),
    getFinancialStatements(ref, "income", "annual"),
    getFinancialStatements(ref, "balance", "annual"),
    getFinancialStatements(ref, "cash-flow", "annual"),
    getDividendHistory(ref),
    getUpcomingDividends(ref),
    prisma.watchlistItem.findUnique({
      where: { userId_instrumentId: { userId, instrumentId: id } },
      select: { id: true },
    }),
    prisma.aiAnalysis.findFirst({
      where: { type: "STOCK_SCORE", subjectType: "instrument", subjectId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const isWatched = watchItem !== null;
  const hasKey = hasAnthropicKey();

  // Parse the persisted STOCK_SCORE for rendering (defense in depth).
  let scoreOutput: StockScoreOutput | null = null;
  let scoreAnalysis: { createdAt: Date; model: string; dataAsOf: Date } | null =
    null;
  if (scoreRow) {
    const parsed = stockScoreSchema.safeParse(scoreRow.output);
    if (parsed.success) {
      scoreOutput = parsed.data;
      scoreAnalysis = {
        createdAt: scoreRow.createdAt,
        model: scoreRow.model,
        dataAsOf: scoreRow.dataAsOf,
      };
    }
  }

  // --- Profile header data ---
  const sector = instrument.sector ?? (profileR.ok ? profileR.data.sector : null);
  const country =
    instrument.country ?? (profileR.ok ? profileR.data.country : null);
  const tags = [instrument.market, sector, country].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );

  const headerChange = historyR.ok ? dayChangeFromHistory(historyR.data) : null;

  // --- Price history chart data ---
  const chartPoints = historyR.ok
    ? [...historyR.data]
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((p) => ({ date: p.date.toISOString(), close: p.close }))
    : [];
  const historyBadge = historyR.ok && historyR.data.length > 0
    ? badgePropsForValueSource({
        kind: historyR.data[0].source,
        asOf: [...historyR.data].sort(
          (a, b) => b.date.getTime() - a.date.getTime(),
        )[0].date,
      })
    : null;

  // --- Statements ---
  const statements = {
    income: buildStatementTab("income", incomeR, instrument.currency),
    balance: buildStatementTab("balance", balanceR, instrument.currency),
    cashFlow: buildStatementTab("cash-flow", cashR, instrument.currency),
  };

  // --- Ratio strip inputs ---
  const incomeRow = incomeR.ok ? incomeR.data.rows[0] : undefined;
  const balanceRow = balanceR.ok ? balanceR.data.rows[0] : undefined;
  const equity = pickNumber(balanceRow, "totalStockholdersEquity");
  const shares = pickNumber(incomeRow, "weightedAverageShsOut");
  const bookValuePerShare =
    equity !== null && shares !== null && shares > 0 ? equity / shares : null;
  const dividendPerShare = dividendR.ok
    ? trailingDividendPerShare(dividendR.data)
    : null;
  const ratioInputs: RatioInputs = {
    price: quoteR.ok ? quoteR.data.price : null,
    earningsPerShare: pickNumber(incomeRow, "eps"),
    bookValuePerShare,
    dividendPerShare,
    totalDebt: pickNumber(balanceRow, "totalDebt"),
    totalEquity: equity,
    netIncome: pickNumber(incomeRow, "netIncome"),
    currentAssets: pickNumber(balanceRow, "totalCurrentAssets"),
    currentLiabilities: pickNumber(balanceRow, "totalCurrentLiabilities"),
  };
  const ratios = deriveRatios(ratioInputs);

  const ratioNumber = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-2xl font-semibold">
                {instrument.ticker}
              </span>
              <span className="text-lg text-slate-600 dark:text-slate-400">
                {instrument.name}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Current price block */}
          <div className="sm:text-right">
            {quoteR.ok ? (
              <>
                <div className="flex items-baseline gap-2 sm:justify-end">
                  <span className="text-3xl font-semibold tabular-nums">
                    {formatMoney(quoteR.data.price, quoteR.data.currency)}
                  </span>
                  {headerChange !== null ? (
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        headerChange > 0
                          ? "text-green-600 dark:text-green-400"
                          : headerChange < 0
                            ? "text-red-600 dark:text-red-400"
                            : undefined,
                      )}
                    >
                      {formatPercent(headerChange, { signed: true })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 sm:flex sm:justify-end">
                  <SourceBadge
                    {...badgePropsForValueSource({
                      kind: quoteR.data.source,
                      asOf: quoteR.data.asOf,
                    })}
                  />
                </div>
              </>
            ) : (
              // Golden rule: never a fake price — say it's unavailable.
              <span className="text-sm text-amber-700 dark:text-amber-400">
                Price unavailable
              </span>
            )}
          </div>
        </div>

        {/* Action row: watch toggle. (The optional "Add Transaction"
            cross-link to the Portfolio dialog is omitted — §4.2 allows it, and
            wiring another page's dialog with a pre-selected instrument is
            cross-page state this page doesn't need to be complete.) */}
        <div className="mt-3">
          <WatchStar instrumentId={instrument.id} watched={isWatched} />
        </div>
      </div>

      {/* Price History */}
      <Card className="gap-4">
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle>Price History</CardTitle>
          {historyBadge ? <SourceBadge {...historyBadge} /> : null}
        </CardHeader>
        <CardContent>
          {historyR.ok && chartPoints.length > 0 ? (
            <PriceHistoryChart
              points={chartPoints}
              currency={
                historyR.data[0]?.currency ?? instrument.currency
              }
            />
          ) : (
            <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Price history unavailable.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Financial Statements */}
      <StatementsCard statements={statements} />

      {/* Ratio strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {ratios.map((tile) => (
          <div key={tile.key} className="rounded-lg border border-border p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tile.label}
            </p>
            {tile.value === null ? (
              <>
                <p className="text-lg font-semibold tabular-nums">—</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Unavailable
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold tabular-nums">
                {tile.percent
                  ? formatPercent(tile.value)
                  : ratioNumber.format(tile.value)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Dividends */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Dividends</CardTitle>
        </CardHeader>
        <CardContent>
          {dividendR.ok && dividendR.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ex-date</TableHead>
                  <TableHead className="text-right">Amount per share</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...dividendR.data]
                  .sort((a, b) => b.exDate.getTime() - a.exDate.getTime())
                  .map((payment, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatShortDate(payment.exDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(payment.amountPerShare, payment.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <SourceBadge
                            size="sm"
                            {...badgePropsForValueSource({
                              kind: payment.source,
                              asOf: payment.exDate,
                            })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No dividend history for this instrument.
            </p>
          )}

          {upcomingResult.ok && upcomingResult.data.length > 0 ? (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold">Upcoming</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {upcomingResult.data.map((dividend, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="tabular-nums text-slate-600 dark:text-slate-400">
                      {formatShortDate(dividend.exDate)}
                    </span>
                    {dividend.amountPerShare !== null ? (
                      <span className="tabular-nums">
                        {formatMoney(dividend.amountPerShare, dividend.currency)}
                      </span>
                    ) : (
                      // Golden rule: never a blank or a zero for an amount that
                      // hasn't been announced.
                      <span className="text-slate-500 dark:text-slate-400">
                        Amount not yet announced
                      </span>
                    )}
                    <SourceBadge
                      size="sm"
                      className="ml-auto"
                      {...badgePropsForValueSource({
                        kind: dividend.source,
                        asOf: dividend.exDate,
                      })}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Health Score (AI) */}
      <HealthScorePanel
        instrumentId={instrument.id}
        hasKey={hasKey}
        analysis={scoreAnalysis}
        output={scoreOutput}
      />

      {/* News — Phase 6 placeholder, same last-section position. */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Recent News</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Newspaper}
            heading="Recent News"
            sentence="News summaries are coming in a later phase."
            comingSoon
            className="min-h-32"
          />
        </CardContent>
      </Card>
    </div>
  );
}
