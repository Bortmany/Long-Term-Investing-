import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnthropicKey } from "@/lib/ai/client";
import { thesisCheckSchema } from "@/lib/ai/schemas";
import { getQuote, type InstrumentRef } from "@/lib/data";
import { getOrCreatePortfolio } from "@/lib/user-portfolio";
import {
  computePortfolioValue,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
} from "@/lib/portfolio";
import { formatMoney, formatQuantity, formatShortDate } from "@/lib/format";
import { badgePropsForValueSource, SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  IntegrityTrendSparkline,
  type IntegrityTrendPoint,
} from "@/components/integrity-trend-sparkline";
import { ThesisStatusButton } from "@/components/theses/thesis-status-button";
import {
  RecommendationBadge,
  ThesisCheckPanel,
} from "@/components/theses/thesis-check-panel";

export const metadata = { title: "Thesis — InvestIQ AI" };

// /theses/[id] — one thesis's full history (ui-spec §5.2). Next.js 16:
// dynamic route params are async.
export default async function ThesisDetailPage({
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

  // Scoped to THIS user's id — a thesis id from the client is never trusted
  // alone. This also correctly 404s another user's thesis id, never a leak.
  const thesis = await prisma.thesis.findFirst({
    where: { id, userId },
    include: {
      instrument: true,
      checks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!thesis) {
    notFound();
  }

  const hasKey = hasAnthropicKey();

  const ref: InstrumentRef = {
    id: thesis.instrument.id,
    ticker: thesis.instrument.ticker,
    market: thesis.instrument.market,
    currency: thesis.instrument.currency,
  };

  // This IS a one-instrument detail page, so the fetching accessor (getQuote)
  // is correct here, per CONVENTIONS' fetch-vs-read-only-cache split.
  const [quoteR, portfolio] = await Promise.all([
    getQuote(ref),
    getOrCreatePortfolio(userId),
  ]);

  const [transactionRows, priceRows, fxRows] = await Promise.all([
    prisma.transaction.findMany({ where: { portfolioId: portfolio.id } }),
    prisma.priceCache.findMany({ where: { instrumentId: thesis.instrument.id } }),
    prisma.fxRate.findMany(),
  ]);

  const portfolioValue = computePortfolioValue({
    transactions: transactionRows.map(fromPrismaTransaction),
    prices: priceRows.map(fromPrismaPriceCache),
    fxRates: fxRows.map(fromPrismaFxRate),
    baseCurrency: portfolio.baseCurrency,
  });
  const holding = portfolioValue.holdings.find(
    (h) => h.instrumentId === thesis.instrument.id,
  );

  // --- Parse each ThesisCheck's persisted evidence Json (defense in depth,
  // matching how /stocks/[id] re-validates scoreRow.output before render). ---
  const parsedChecks = thesis.checks.flatMap((check) => {
    const parsed = thesisCheckSchema.safeParse(check.evidence);
    if (!parsed.success) return [];
    return [
      {
        id: check.id,
        createdAt: check.createdAt,
        model: check.model,
        dataAsOf: check.dataAsOf,
        output: parsed.data,
      },
    ];
  });

  const latestCheck = parsedChecks[0] ?? null;

  const sparklinePoints: IntegrityTrendPoint[] = [...parsedChecks]
    .reverse()
    .map((check) => ({ date: check.createdAt, score: check.output.integrityScore }));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          href="/theses"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← All Theses
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-mono text-2xl font-semibold">
            {thesis.instrument.ticker}
          </span>
          <span className="text-lg text-slate-600 dark:text-slate-400">
            {thesis.instrument.name}
          </span>
          <StatusBadge status={thesis.status} />
          <ThesisStatusButton thesisId={thesis.id} status={thesis.status} />
        </div>
      </div>

      {/* Statement */}
      <blockquote className="border-l-2 border-slate-300 pl-4 text-base italic leading-relaxed text-slate-700 dark:border-slate-700 dark:text-slate-300">
        {thesis.statement}
      </blockquote>

      {/* Instrument snapshot */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <SnapshotItem label="Ticker">
          <span className="font-mono">{thesis.instrument.ticker}</span>
        </SnapshotItem>

        <SnapshotItem label="Current Price">
          {quoteR.ok ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums">
                {formatMoney(quoteR.data.price, quoteR.data.currency)}
              </span>
              <SourceBadge
                size="sm"
                {...badgePropsForValueSource({ kind: quoteR.data.source, asOf: quoteR.data.asOf })}
              />
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">Price unavailable</span>
          )}
        </SnapshotItem>

        {holding ? (
          <SnapshotItem label="Position">
            {holding.valuation.ok ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="tabular-nums">
                  {formatQuantity(holding.quantity)} sh ·{" "}
                  {formatMoney(holding.valuation.marketValue, portfolio.baseCurrency)}
                </span>
                <SourceBadge size="sm" {...badgePropsForValueSource(holding.valuation.source)} />
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                {holding.valuation.reason === "missing_price"
                  ? "Unavailable — no price"
                  : "Unavailable — no exchange rate"}
              </span>
            )}
          </SnapshotItem>
        ) : null}

        {thesis.instrument.sector ? (
          <SnapshotItem label="Sector">{thesis.instrument.sector}</SnapshotItem>
        ) : null}

        {thesis.instrument.country ? (
          <SnapshotItem label="Country">{thesis.instrument.country}</SnapshotItem>
        ) : null}
      </div>

      {/* Integrity trend sparkline (nothing rendered below 2 checks) */}
      <IntegrityTrendSparkline points={sparklinePoints} />

      {/* Latest Check (AI) */}
      <ThesisCheckPanel
        thesisId={thesis.id}
        hasKey={hasKey}
        analysis={latestCheck}
        output={latestCheck?.output ?? null}
      />

      {/* Check History */}
      {parsedChecks.length > 0 ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Check History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="text-right">Integrity Score</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedChecks.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell>{formatShortDate(check.createdAt)}</TableCell>
                    <TableCell>
                      <RecommendationBadge recommendation={check.output.recommendation} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {check.output.integrityScore}
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      <Tooltip>
                        <TooltipTrigger className="block max-w-md truncate text-left">
                          {check.output.summary}
                        </TooltipTrigger>
                        <TooltipContent>{check.output.summary}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SnapshotItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      {children}
    </span>
  );
}

/** Same ACTIVE/CLOSED treatment as the list (§5.1). */
function StatusBadge({ status }: { status: "ACTIVE" | "CLOSED" }) {
  if (status === "ACTIVE") {
    return (
      <Badge variant="outline" className="gap-1.5 font-normal text-slate-600 dark:text-slate-400">
        <span
          aria-hidden="true"
          className="inline-block size-2 shrink-0 rounded-full bg-green-600 dark:bg-green-400"
        />
        Active
      </Badge>
    );
  }
  return <Badge variant="secondary">Closed</Badge>;
}
