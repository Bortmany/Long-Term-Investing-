import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { Coins, Inbox, TriangleAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeAllocation,
  computeDividendsByHolding,
  computeMonthlyDividends,
  computeReturns,
  computeTrailingDividendIncome,
  type AllocatableHolding,
  type Allocation,
  type ReturnFigure,
} from "@/lib/portfolio";
import { loadPortfolioComputation } from "@/lib/portfolio-market-data";
import { getUpcomingDividends, type UpcomingDividend } from "@/lib/data";
import { formatMoney, formatPercent, formatQuantity, formatShortDate } from "@/lib/format";
import {
  SourceBadge,
  badgePropsForValueSource,
  badgePropsForValueSources,
  type SourceBadgeProps,
} from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { ExplainerTip } from "@/components/explainer-tip";
import { LatestReviewCard } from "@/components/latest-review-card";
import {
  HealthScorePanel,
  parseHealthScoreAnalysis,
} from "@/components/health/health-score-panel";
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
import { cn } from "@/lib/utils";

// Allocation donuts and the dividend bar chart are recharts, lazy-loaded so
// they never block first paint (UI spec §3.1). The "loading" fallback is a
// shaped skeleton, not a spinner, so the page geometry doesn't jump.
const AllocationDonut = dynamic(() => import("@/components/dashboard/allocation-donut"), {
  loading: () => <DonutSkeleton />,
});
const DividendBarChart = dynamic(() => import("@/components/dashboard/dividend-bar-chart"), {
  loading: () => <BarChartSkeleton />,
});

function DonutSkeleton() {
  return (
    <div className="flex flex-col items-center">
      <Skeleton className="size-[160px] rounded-full" />
      <div className="mt-3 w-full space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function BarChartSkeleton() {
  return (
    <div className="flex h-[200px] items-end gap-1.5">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton
          key={i}
          className="w-full"
          style={{ height: `${25 + ((i * 13) % 65)}%` }}
        />
      ))}
    </div>
  );
}

/** "+OMR 12.500" / "−OMR 3.000" — sign out front so it never hides in the currency prefix. */
function signedMoney(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

/** Green for gains, red for losses — reserved for genuine return figures (§2.6). */
function gainLossColor(amount: number): string {
  if (amount > 0) return "text-green-600 dark:text-green-400";
  if (amount < 0) return "text-red-600 dark:text-red-400";
  return "";
}

// Dashboard: the one screen with real computed data in Phase 1, extended in
// Phase 2 with return cards, allocation donuts and a dividend module.
// Everything is loaded server-side, scoped to the signed-in user, and run
// through the pure portfolio math library. Golden rule: every figure carries
// a source badge, and anything that couldn't be valued is SAID, not padded.
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // ONE shared computation — the Dashboard and Portfolio pages load the same
  // transactions in the same order and run the same valuation, so their
  // headline totals can never disagree (this includes the user's own manual
  // price/FX overrides, never anyone else's). See loadPortfolioComputation.
  const computation = await loadPortfolioComputation(session.user.id);

  if (!computation) {
    return (
      <>
        <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
        <EmptyState
          icon={Inbox}
          heading="No portfolio yet"
          sentence="Your portfolio will appear here once it's set up."
        />
      </>
    );
  }

  const { portfolio, transactions, instrumentIds, fxRates, portfolioValue } =
    computation;

  const instrumentRows = await prisma.instrument.findMany({
    where: { id: { in: instrumentIds } },
  });

  const dividendIncome = computeTrailingDividendIncome(transactions, {
    baseCurrency: portfolio.baseCurrency,
    fxRates,
  });

  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));
  const base = portfolio.baseCurrency;

  // Aggregate badges are derived from the sources the math library reports —
  // with seed data everything resolves to "sample data".
  const totalBadge = badgePropsForValueSources(portfolioValue.sources);
  // Cash and dividend income are derived purely from the (seeded) transactions.
  const cashBadge = badgePropsForValueSources([{ kind: "derived" }]);
  const dividendBadge = badgePropsForValueSources([{ kind: "derived" }]);

  const holdings = [...portfolioValue.holdings].sort((a, b) => {
    const av = a.valuation.ok ? a.valuation.marketValue : -1;
    const bv = b.valuation.ok ? b.valuation.marketValue : -1;
    return bv - av;
  });

  // --- Return cards (with / without dividends) -----------------------------
  const returns = computeReturns({
    transactions,
    currentValue: portfolioValue.totalValue,
    baseCurrency: base,
    fxRates,
  });
  const hasHoldings = holdings.length > 0;
  // Zero holdings: nothing to be incomplete about — show a flat zero with a
  // "derived" badge rather than a stray non-zero number from cash-only
  // activity (e.g. a fee charged before any position was ever opened).
  const returnsBadgeProps: Pick<SourceBadgeProps, "variant" | "date"> = hasHoldings
    ? totalBadge
    : { variant: "derived" };
  const withDividendsFigure: ReturnFigure = hasHoldings
    ? returns.withDividends
    : { absolute: 0, percent: 0 };
  const withoutDividendsFigure: ReturnFigure = hasHoldings
    ? returns.withoutDividends
    : { absolute: 0, percent: 0 };

  // --- Allocation donuts (Sector / Country / Market) ------------------------
  const allocatable: AllocatableHolding[] = [];
  for (const holding of holdings) {
    if (!holding.valuation.ok) continue;
    const instrument = instrumentById.get(holding.instrumentId);
    if (!instrument) continue;
    allocatable.push({
      instrumentId: holding.instrumentId,
      marketValue: holding.valuation.marketValue,
      sector: instrument.sector,
      country: instrument.country,
      market: instrument.market,
    });
  }
  const sectorAllocation = computeAllocation(allocatable, "sector");
  const countryAllocation = computeAllocation(allocatable, "country");
  const marketAllocation = computeAllocation(allocatable, "market");

  // --- Dividend module -------------------------------------------------------
  const hasDividendHistory = transactions.some((t) => t.type === "DIVIDEND");
  const monthlyDividends = computeMonthlyDividends(transactions, {
    baseCurrency: base,
    fxRates,
  });
  const dividendsByHolding = computeDividendsByHolding(transactions, {
    baseCurrency: base,
    fxRates,
  });

  type UpcomingRow = UpcomingDividend & { ticker: string };
  const upcomingRows: UpcomingRow[] = [];
  let upcomingUnavailable = false;

  if (hasDividendHistory && holdings.length > 0) {
    const results = await Promise.all(
      holdings.map(async (holding) => {
        const instrument = instrumentById.get(holding.instrumentId);
        if (!instrument) return null;
        const result = await getUpcomingDividends({
          id: instrument.id,
          ticker: instrument.ticker,
          market: instrument.market,
          currency: instrument.currency,
        });
        return { ticker: instrument.ticker, result };
      }),
    );
    const usable = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const anyOk = usable.some((r) => r.result.ok);
    if (anyOk) {
      for (const { ticker, result } of usable) {
        if (result.ok) {
          for (const dividend of result.data) {
            upcomingRows.push({ ticker, ...dividend });
          }
        }
      }
      upcomingRows.sort((a, b) => a.exDate.getTime() - b.exDate.getTime());
    } else if (usable.length > 0) {
      // Every held instrument's lookup came back unavailable (no live
      // market-data connection) — say so honestly, never show an empty list
      // pretending there's simply nothing coming up (golden rule).
      upcomingUnavailable = true;
    }
  }

  // Golden rule: any figure that had to leave something out (missing price
  // or FX rate) makes the whole page say so — covers the original totals
  // plus the return/dividend figures this phase adds.
  const incomplete =
    !portfolioValue.complete ||
    !dividendIncome.complete ||
    !returns.complete ||
    !monthlyDividends.complete ||
    !dividendsByHolding.complete;

  // Health Score: read whatever is already stored — this page never
  // generates one itself (THE AI RULE, docs/CONVENTIONS.md). The key itself
  // never leaves this file, only whether one is configured.
  const healthScoreRow = await prisma.aiAnalysis.findFirst({
    where: {
      userId: session.user.id,
      type: "HEALTH_SCORE",
      subjectType: "portfolio",
      subjectId: portfolio.id,
    },
    orderBy: { createdAt: "desc" },
  });
  const healthScoreAnalysis = parseHealthScoreAnalysis(healthScoreRow);
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      {incomplete ? (
        // Golden rule: totals below exclude anything that couldn't be valued,
        // and we say so instead of padding the numbers.
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Some positions couldn&apos;t be valued (missing price or exchange rate).
            The totals below include only what could be valued.
          </p>
        </div>
      ) : null}

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total Portfolio Value"
          value={formatMoney(portfolioValue.totalValue, base)}
          badge={<SourceBadge {...totalBadge} />}
        />
        <SummaryCard
          label={
            <span className="inline-flex items-center gap-1">
              Cash Balance <ExplainerTip term="cash-balance" />
            </span>
          }
          value={formatMoney(portfolioValue.cashValue, base)}
          badge={<SourceBadge {...cashBadge} />}
        />
        <SummaryCard
          label={
            <span className="inline-flex items-center gap-1">
              Trailing 12-Month Dividend Income <ExplainerTip term="trailing-dividend-income" />
            </span>
          }
          value={formatMoney(dividendIncome.total, base)}
          badge={<SourceBadge {...dividendBadge} />}
        />
      </div>

      {/* Weekly Review — reads whatever is already stored, never generates
          anything on render (THE AI RULE). */}
      <div className="mt-6">
        <LatestReviewCard userId={session.user.id} />
      </div>

      {/* Return cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard
          label={
            <span className="inline-flex items-center gap-1">
              Total Return (with dividends) <ExplainerTip term="total-return" />
            </span>
          }
          value={
            <>
              {signedMoney(withDividendsFigure.absolute, base)}{" "}
              <span className="text-sm font-medium">
                ({formatPercent(withDividendsFigure.percent, { signed: true })})
              </span>
            </>
          }
          valueClassName={gainLossColor(withDividendsFigure.absolute)}
          badge={<SourceBadge {...returnsBadgeProps} />}
        />
        <SummaryCard
          label={
            <span className="inline-flex items-center gap-1">
              Total Return (without dividends) <ExplainerTip term="total-return" />
            </span>
          }
          value={
            <>
              {signedMoney(withoutDividendsFigure.absolute, base)}{" "}
              <span className="text-sm font-medium">
                ({formatPercent(withoutDividendsFigure.percent, { signed: true })})
              </span>
            </>
          }
          valueClassName={gainLossColor(withoutDividendsFigure.absolute)}
          badge={<SourceBadge {...returnsBadgeProps} />}
        />
      </div>

      {/* Allocation donuts */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <AllocationCard
          title={
            <span className="inline-flex items-center gap-1">
              By Sector <ExplainerTip term="allocation" />
            </span>
          }
          allocation={sectorAllocation}
          badge={<SourceBadge {...totalBadge} />}
          baseCurrency={base}
        />
        <AllocationCard
          title={
            <span className="inline-flex items-center gap-1">
              By Country <ExplainerTip term="allocation" />
            </span>
          }
          allocation={countryAllocation}
          badge={<SourceBadge {...totalBadge} />}
          baseCurrency={base}
        />
        <AllocationCard
          title={
            <span className="inline-flex items-center gap-1">
              By Market <ExplainerTip term="allocation" />
            </span>
          }
          allocation={marketAllocation}
          badge={<SourceBadge {...totalBadge} />}
          baseCurrency={base}
        />
      </div>

      {/* Holdings table */}
      <Card className="mt-6 gap-4">
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle>Holdings</CardTitle>
          {/* Derived from the actual valuation sources (same as the total card),
              so this stays honest when live or manual prices arrive. */}
          <SourceBadge {...totalBadge} />
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <EmptyState
              icon={Inbox}
              heading="Holdings"
              sentence="No holdings yet."
              className="min-h-48"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Value ({base})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => {
                  const instrument = instrumentById.get(holding.instrumentId);
                  return (
                    <TableRow key={holding.instrumentId}>
                      <TableCell className="font-mono font-medium">
                        {instrument?.ticker ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {instrument?.name ?? "Unknown instrument"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(holding.quantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {holding.valuation.ok ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-medium tabular-nums">
                              {formatMoney(holding.valuation.marketValue, base)}
                            </span>
                            <SourceBadge
                              size="sm"
                              {...badgePropsForValueSource(holding.valuation.source)}
                            />
                          </span>
                        ) : (
                          // Never a fake number: say why it couldn't be valued.
                          <span className="text-sm text-amber-700 dark:text-amber-400">
                            {holding.valuation.reason === "missing_price"
                              ? "Unavailable — no price"
                              : "Unavailable — no exchange rate"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dividend module */}
      <Card className="mt-6 gap-4">
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle>Dividend Income</CardTitle>
          <SourceBadge variant="derived" />
        </CardHeader>
        <CardContent>
          {!hasDividendHistory ? (
            <EmptyState
              icon={Coins}
              heading="Dividend Income"
              sentence="No dividend income yet."
              className="min-h-48"
            />
          ) : (
            <>
              <DividendBarChart buckets={monthlyDividends.buckets} baseCurrency={base} />

              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Income by Holding</h3>
                {dividendsByHolding.rows.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No dividend income in the trailing 12 months.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {dividendsByHolding.rows.map((row) => {
                      const instrument = instrumentById.get(row.instrumentId);
                      return (
                        <li
                          key={row.instrumentId}
                          className="flex items-center justify-between gap-3 py-1.5 text-sm"
                        >
                          <span className="font-mono font-medium">
                            {instrument?.ticker ?? "—"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="tabular-nums">
                              {formatMoney(row.total, base)}
                            </span>
                            <SourceBadge size="sm" variant="derived" />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Upcoming</h3>
                {upcomingUnavailable ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Upcoming dividends require a live market-data connection for
                    these holdings.
                  </p>
                ) : upcomingRows.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No upcoming dividends found.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {upcomingRows.map((row, i) => (
                      <li
                        key={`${row.ticker}-${i}`}
                        className="flex items-center justify-between gap-3 py-1.5 text-sm"
                      >
                        <span className="font-mono font-medium">{row.ticker}</span>
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
                          <SourceBadge size="sm" variant={row.source} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Portfolio Health Score (AI) */}
      <HealthScorePanel
        analysis={healthScoreAnalysis}
        hasKey={hasAnthropicKey}
        className="mt-6"
      />
    </>
  );
}

function SummaryCard({
  label,
  value,
  badge,
  valueClassName,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  badge: React.ReactNode;
  /** Optional override (e.g. green/red for a signed return figure). */
  valueClassName?: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-5">
        {/* label/value are plain <div>s, not <p>: label carries ExplainerTip
            (a Dialog — DialogContent/DialogHeader/DialogTitle render <div>s
            and an <h2>), and a <p> can never legally contain block-level
            children. The old <p> wrapping caused real invalid-nesting
            hydration warnings whenever an explainer was opened. */}
        <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
        <div
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </div>
        <div className="mt-2">{badge}</div>
      </CardContent>
    </Card>
  );
}

function AllocationCard({
  title,
  allocation,
  badge,
  baseCurrency,
}: {
  title: React.ReactNode;
  allocation: Allocation;
  badge: React.ReactNode;
  baseCurrency: string;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center gap-3">
        <CardTitle>{title}</CardTitle>
        {badge}
      </CardHeader>
      <CardContent>
        {allocation.slices.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No holdings to allocate yet.
          </p>
        ) : (
          <AllocationDonut slices={allocation.slices} baseCurrency={baseCurrency} />
        )}
      </CardContent>
    </Card>
  );
}
