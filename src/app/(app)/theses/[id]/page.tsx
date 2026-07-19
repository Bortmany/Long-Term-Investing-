import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BookOpen } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/data";
import { getAiClient } from "@/lib/ai/client";
import { thesisCheckSchema } from "@/lib/ai/schemas";
import {
  badgePropsForValueSource,
  SourceBadge,
} from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThesisStatusChip } from "@/components/theses/thesis-status-chip";
import { ThesisCheckPanel } from "@/components/theses/thesis-check-panel";
import { CheckHistoryTimeline } from "@/components/theses/check-history-timeline";
import { CloseReopenThesisButton } from "@/components/theses/close-reopen-thesis-button";
import {
  computePortfolioValue,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
} from "@/lib/portfolio";
import { formatMoney, formatQuantity } from "@/lib/format";

// The integrity sparkline is recharts, lazy-loaded so it never blocks first
// paint (same pattern as the stock detail page's price-history chart).
const IntegrityTrendSparkline = dynamic(
  () => import("@/components/integrity-trend-sparkline"),
  { loading: () => <Skeleton className="h-12 w-full" /> },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const thesis = session
    ? await prisma.thesis.findFirst({
        where: { id, userId: session.user.id },
        include: { instrument: true },
      })
    : null;
  return {
    title: thesis
      ? `${thesis.instrument.ticker} thesis — InvestIQ AI`
      : "Thesis — InvestIQ AI",
  };
}

export default async function ThesisDetailPage({
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

  // Ownership check: only THIS user's own thesis, never a client-supplied id
  // trusted on its own.
  const thesis = await prisma.thesis.findFirst({
    where: { id, userId },
    include: { instrument: true },
  });

  if (!thesis) {
    return (
      <EmptyState
        icon={BookOpen}
        heading="Thesis not found"
        sentence="This thesis doesn't exist or has been removed."
        action={
          <Button asChild>
            <Link href="/theses">Back to Theses</Link>
          </Button>
        }
      />
    );
  }

  const instrument = thesis.instrument;
  const ref = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const [quoteResult, checks, storedAnalysis, portfolio] = await Promise.all([
    getQuote(ref),
    prisma.thesisCheck.findMany({
      where: { thesisId: thesis.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiAnalysis.findFirst({
      where: {
        userId,
        type: "THESIS_CHECK",
        subjectType: "thesis",
        subjectId: thesis.id,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

  // --- Position, if this instrument is currently held ----------------------
  let position: {
    quantity: number;
    marketValue: number;
    currency: string;
    badge: ReturnType<typeof badgePropsForValueSource>;
  } | null = null;
  if (portfolio) {
    const [transactionRows, priceRows, fxRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { portfolioId: portfolio.id, instrumentId: instrument.id },
      }),
      prisma.priceCache.findMany({ where: { instrumentId: instrument.id } }),
      prisma.fxRate.findMany(),
    ]);
    const value = computePortfolioValue({
      transactions: transactionRows.map(fromPrismaTransaction),
      prices: priceRows.map(fromPrismaPriceCache),
      fxRates: fxRows.map(fromPrismaFxRate),
      baseCurrency: portfolio.baseCurrency,
    });
    const holding = value.holdings.find((h) => h.instrumentId === instrument.id);
    if (holding && holding.valuation.ok) {
      position = {
        quantity: holding.quantity,
        marketValue: holding.valuation.marketValue,
        currency: portfolio.baseCurrency,
        badge: badgePropsForValueSource(holding.valuation.source),
      };
    }
  }

  // --- Latest Check panel data ----------------------------------------------
  const hasAiKey = getAiClient().ok;
  let checkOutput = null;
  if (storedAnalysis) {
    const parsed = thesisCheckSchema.safeParse(storedAnalysis.output);
    if (parsed.success) checkOutput = parsed.data;
  }
  const checkAnalysis =
    storedAnalysis && checkOutput
      ? {
          createdAt: storedAnalysis.createdAt,
          model: storedAnalysis.model,
          dataAsOf: storedAnalysis.dataAsOf,
        }
      : null;

  // --- Integrity sparkline: only when 2+ checks exist, oldest to newest ----
  const sparklinePoints =
    checks.length >= 2
      ? [...checks]
          .reverse()
          .map((check) => ({ date: check.createdAt, score: check.integrityScore }))
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/theses"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← All Theses
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{instrument.ticker}</h1>
          <span className="text-lg text-slate-600 dark:text-slate-400">
            {instrument.name}
          </span>
          <ThesisStatusChip status={thesis.status} />
          <CloseReopenThesisButton
            thesisId={thesis.id}
            status={thesis.status}
            ticker={instrument.ticker}
          />
        </div>
      </div>

      <blockquote className="border-l-2 border-slate-300 pl-4 text-base italic leading-relaxed text-slate-700 dark:border-slate-700 dark:text-slate-300">
        {thesis.statement}
      </blockquote>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>
          Ticker: <span className="font-mono font-medium">{instrument.ticker}</span>
        </span>
        {quoteResult.ok ? (
          <span className="inline-flex items-center gap-1.5">
            Current Price:{" "}
            <span className="tabular-nums">
              {formatMoney(quoteResult.data.price, quoteResult.data.currency)}
            </span>
            <SourceBadge
              size="sm"
              {...badgePropsForValueSource({
                kind: quoteResult.data.source,
                asOf: quoteResult.data.asOf,
              })}
            />
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">
            Current Price: Unavailable — no price
          </span>
        )}
        {position ? (
          <span className="inline-flex items-center gap-1.5">
            Position: {formatQuantity(position.quantity)} shares (
            <span className="tabular-nums">
              {formatMoney(position.marketValue, position.currency)}
            </span>
            ) <SourceBadge size="sm" {...position.badge} />
          </span>
        ) : null}
        {instrument.sector ? <span>Sector: {instrument.sector}</span> : null}
        {instrument.country ? <span>Country: {instrument.country}</span> : null}
      </div>

      {sparklinePoints.length >= 2 ? (
        <IntegrityTrendSparkline points={sparklinePoints} />
      ) : null}

      <ThesisCheckPanel
        thesisId={thesis.id}
        hasKey={hasAiKey}
        analysis={checkAnalysis}
        output={checkOutput}
      />

      <CheckHistoryTimeline checks={checks} />
    </div>
  );
}
