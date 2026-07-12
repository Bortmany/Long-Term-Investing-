import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Inbox, TriangleAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computePortfolioValue,
  computeTrailingDividendIncome,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
} from "@/lib/portfolio";
import { formatMoney, formatQuantity } from "@/lib/format";
import {
  SourceBadge,
  badgePropsForValueSource,
  badgePropsForValueSources,
} from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Dashboard: the one screen with real computed data in Phase 1.
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

  const incomplete = !portfolioValue.complete || !dividendIncome.complete;

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
    </>
  );
}

function SummaryCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
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
