import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Coins, Inbox, TriangleAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeAllocation,
  computeDividendsByHolding,
  computeMonthlyDividends,
  computePortfolioValue,
  computeReturns,
  computeTrailingDividendIncome,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type AllocatableHolding,
} from "@/lib/portfolio";
import { getUpcomingDividends, type UpcomingDividend } from "@/lib/data";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatShortDate,
} from "@/lib/format";
import {
  SourceBadge,
  badgePropsForValueSource,
  badgePropsForValueSources,
} from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { AllocationDonut } from "@/components/dashboard/allocation-donut";
import { DividendBarChart } from "@/components/dashboard/dividend-bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Dashboard: the at-a-glance portfolio snapshot.
// Everything is loaded server-side, scoped to the signed-in user, and run
// through the pure portfolio math library. Golden rule: every figure carries
// a source badge, and anything that couldn't be valued is SAID, not padded.
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // Every query is scoped to the signed-in user's id (from the server session).
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: session.user.id },
  });

  if (!portfolio) {
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

  const transactionRows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id },
  });

  const instrumentIds = [
    ...new Set(
      transactionRows
        .map((t) => t.instrumentId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [priceRows, fxRows, instrumentRows] = await Promise.all([
    prisma.priceCache.findMany({ where: { instrumentId: { in: instrumentIds } } }),
    prisma.fxRate.findMany(),
    prisma.instrument.findMany({ where: { id: { in: instrumentIds } } }),
  ]);

  const transactions = transactionRows.map(fromPrismaTransaction);
  const fxRates = fxRows.map(fromPrismaFxRate);

  const portfolioValue = computePortfolioValue({
    transactions,
    prices: priceRows.map(fromPrismaPriceCache),
    fxRates,
    baseCurrency: portfolio.baseCurrency,
  });

  const dividendIncome = computeTrailingDividendIncome(transactions, {
    baseCurrency: portfolio.baseCurrency,
    fxRates,
  });

  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));
  const base = portfolio.baseCurrency;

  // Total return, with and without dividends — pure math over the user's own
  // transactions plus the same valued total the summary card shows.
  const returns = computeReturns({
    transactions,
    currentValue: portfolioValue.totalValue,
    baseCurrency: base,
    fxRates,
  });

  // Allocation slices group only the holdings that could actually be valued —
  // anything unvalued is reported by the banner, never hidden inside a chart.
  const allocatable: AllocatableHolding[] = portfolioValue.holdings.flatMap(
    (holding) => {
      if (!holding.valuation.ok) return [];
      const instrument = instrumentById.get(holding.instrumentId);
      if (!instrument) return [];
      return [
        {
          instrumentId: holding.instrumentId,
          marketValue: holding.valuation.marketValue,
          sector: instrument.sector,
          country: instrument.country,
          market: instrument.market,
        },
      ];
    },
  );
  const allocations = [
    { title: "By Sector", allocation: computeAllocation(allocatable, "sector") },
    { title: "By Country", allocation: computeAllocation(allocatable, "country") },
    { title: "By Market", allocation: computeAllocation(allocatable, "market") },
  ];

  // Dividend module data (all derived from the user's own transactions).
  const hasDividendHistory = transactions.some((t) => t.type === "DIVIDEND");
  const monthlyDividends = computeMonthlyDividends(transactions, {
    baseCurrency: base,
    fxRates,
  });
  const dividendsByHolding = computeDividendsByHolding(transactions, {
    baseCurrency: base,
    fxRates,
  });

  // Upcoming dividends come from the market-data layer (golden rule: a typed
  // unavailable result is shown as such, never papered over). Only worth
  // asking about instruments currently held, and only once dividend history
  // exists at all (otherwise the whole card is the empty placeholder).
  const upcomingRows: { ticker: string; dividend: UpcomingDividend }[] = [];
  const upcomingUnavailableTickers: string[] = [];
  if (hasDividendHistory) {
    const heldInstruments = portfolioValue.holdings
      .map((holding) => instrumentById.get(holding.instrumentId))
      .filter((instrument) => instrument !== undefined);
    const results = await Promise.all(
      heldInstruments.map(async (instrument) => ({
        instrument,
        result: await getUpcomingDividends(instrument),
      })),
    );
    for (const { instrument, result } of results) {
      if (result.ok) {
        for (const dividend of result.data) {
          upcomingRows.push({ ticker: instrument.ticker, dividend });
        }
      } else {
        upcomingUnavailableTickers.push(instrument.ticker);
      }
    }
    // Soonest ex-date first.
    upcomingRows.sort(
      (a, b) => a.dividend.exDate.getTime() - b.dividend.exDate.getTime(),
    );
  }

  // Aggregate badges are derived from the sources the math library reports —
  // with seed data everything resolves to "sample data".
  const totalBadge = badgePropsForValueSources(portfolioValue.sources);
  // Cash and dividend income are derived purely from the user's transactions.
  const cashBadge = badgePropsForValueSources([{ kind: "derived" }]);
  const dividendBadge = badgePropsForValueSources([{ kind: "derived" }]);
  // Returns depend on the same prices as Total Portfolio Value plus the
  // user's own cost-basis transactions — same aggregate badge.
  const returnBadge = totalBadge;

  const holdings = [...portfolioValue.holdings].sort((a, b) => {
    const av = a.valuation.ok ? a.valuation.marketValue : -1;
    const bv = b.valuation.ok ? b.valuation.marketValue : -1;
    return bv - av;
  });

  const incomplete =
    !portfolioValue.complete ||
    !dividendIncome.complete ||
    !returns.complete ||
    !monthlyDividends.complete ||
    !dividendsByHolding.complete;

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
          label="Cash Balance"
          value={formatMoney(portfolioValue.cashValue, base)}
          badge={<SourceBadge {...cashBadge} />}
        />
        <SummaryCard
          label="Trailing 12-Month Dividend Income"
          value={formatMoney(dividendIncome.total, base)}
          badge={<SourceBadge {...dividendBadge} />}
        />
      </div>

      {/* Return cards row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard
          label="Total Return (with dividends)"
          value={
            <ReturnValue
              absolute={returns.withDividends.absolute}
              percent={returns.withDividends.percent}
              currency={base}
            />
          }
          badge={<SourceBadge {...returnBadge} />}
        />
        <SummaryCard
          label="Total Return (without dividends)"
          value={
            <ReturnValue
              absolute={returns.withoutDividends.absolute}
              percent={returns.withoutDividends.percent}
              currency={base}
            />
          }
          badge={<SourceBadge {...returnBadge} />}
        />
      </div>

      {/* Allocation donuts row */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {allocations.map(({ title, allocation }) => (
          <Card key={title} className="gap-4">
            <CardHeader className="flex-row items-center gap-3">
              <CardTitle>{title}</CardTitle>
              {/* Same valued holdings as the total, sliced differently — one
                  aggregate badge per chart is the honest granularity. */}
              <SourceBadge {...totalBadge} />
            </CardHeader>
            <CardContent>
              {allocatable.length === 0 ? (
                // Golden rule: no chart drawn from nothing.
                <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  No holdings to allocate yet.
                </p>
              ) : (
                <AllocationDonut slices={allocation.slices} />
              )}
            </CardContent>
          </Card>
        ))}
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
          {/* Monthly totals and per-holding income are pure transaction math. */}
          <SourceBadge {...dividendBadge} />
        </CardHeader>
        <CardContent>
          {!hasDividendHistory ? (
            // No DIVIDEND transactions ever: a chart of all-zero bars would be
            // misleading, not honest — show the placeholder instead.
            <EmptyState
              icon={Coins}
              heading="Dividend Income"
              sentence="No dividend income yet."
              className="min-h-48"
            />
          ) : (
            <>
              {/* Trailing-12-month income, one bar per calendar month. */}
              <DividendBarChart
                bars={monthlyDividends.buckets.map((bucket) => ({
                  label: bucket.label,
                  total: bucket.total,
                }))}
                currency={base}
              />

              {/* Income by holding (trailing 12 months, top payer first). */}
              <h3 className="mb-2 mt-4 text-sm font-semibold">Income by holding</h3>
              {dividendsByHolding.rows.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No dividend income in the last 12 months.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {dividendsByHolding.rows.map((row) => (
                    <li key={row.instrumentId} className="flex items-center gap-2">
                      <span className="flex-1 font-mono font-medium">
                        {instrumentById.get(row.instrumentId)?.ticker ?? "—"}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(row.total, base)}
                      </span>
                      <SourceBadge size="sm" variant="derived" />
                    </li>
                  ))}
                </ul>
              )}

              {/* Upcoming dividends, from the market-data layer. */}
              <h3 className="mb-2 mt-4 text-sm font-semibold">Upcoming</h3>
              {upcomingRows.length > 0 ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {upcomingRows.map(({ ticker, dividend }, index) => (
                    <li
                      key={`${ticker}-${dividend.exDate.toISOString()}-${index}`}
                      className="flex items-center gap-2"
                    >
                      <span className="flex-1 font-mono font-medium">{ticker}</span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-400">
                        {formatShortDate(dividend.exDate)}
                      </span>
                      {dividend.amountPerShare !== null ? (
                        <span className="tabular-nums">
                          {formatMoney(dividend.amountPerShare, dividend.currency)}
                        </span>
                      ) : (
                        // Golden rule: never a blank or a zero standing in for
                        // an amount that hasn't been announced.
                        <span className="text-slate-500 dark:text-slate-400">
                          Amount not yet announced
                        </span>
                      )}
                      <SourceBadge size="sm" variant={dividend.source} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {upcomingUnavailableTickers.length > 0 ? (
                // Golden rule: an honest unavailable line, never invented rows.
                <p
                  className={cn(
                    "text-sm text-slate-500 dark:text-slate-400",
                    upcomingRows.length > 0 && "mt-2",
                  )}
                >
                  Upcoming dividend data is unavailable for{" "}
                  {upcomingUnavailableTickers.join(", ")}.
                </p>
              ) : null}
              {upcomingRows.length === 0 &&
              upcomingUnavailableTickers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No upcoming dividends found.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SummaryCard({
  label,
  value,
  badge,
}: {
  label: string;
  /** Either a plain formatted string or a styled value line (return cards). */
  value: React.ReactNode;
  badge: React.ReactNode;
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-5">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
        <div className="mt-2">{badge}</div>
      </CardContent>
    </Card>
  );
}

// Signed money + percent on one line, green/red per UI spec §2.6 — these are
// genuine return figures, so color is allowed. An exact zero stays neutral
// and shows "+0.0%", matching the spec's empty-portfolio case.
function ReturnValue({
  absolute,
  percent,
  currency,
}: {
  absolute: number;
  percent: number;
  currency: string;
}) {
  const color =
    absolute > 0
      ? "text-green-600 dark:text-green-400"
      : absolute < 0
        ? "text-red-600 dark:text-red-400"
        : undefined;
  const sign = absolute > 0 ? "+" : absolute < 0 ? "−" : "";
  const percentText =
    percent === 0 ? "+0.0%" : formatPercent(percent, { signed: true });

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", color)}>
      <span>
        {sign}
        {formatMoney(Math.abs(absolute), currency)}
      </span>
      <span className="text-sm font-medium">({percentText})</span>
    </span>
  );
}
