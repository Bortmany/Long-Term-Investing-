import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileSearch } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/data";
import { getAiClient } from "@/lib/ai/client";
import {
  buyAnalysisSchema,
  committeeOutputSchema,
  sellAnalysisSchema,
} from "@/lib/ai/schemas";
import { badgePropsForValueSource } from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { CommitteeResultPanel } from "@/components/committee/committee-result-panel";
import { BuyAnalysisPanel, type CurrentPriceInfo } from "@/components/committee/buy-analysis-panel";
import { SellAnalysisPanel } from "@/components/committee/sell-analysis-panel";

const HISTORY_TYPES = ["COMMITTEE", "BUY_ANALYSIS", "SELL_ANALYSIS"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const row = session
    ? await prisma.aiAnalysis.findFirst({ where: { id, userId: session.user.id } })
    : null;
  const instrument = row
    ? await prisma.instrument.findUnique({ where: { id: row.subjectId } })
    : null;
  return {
    title: instrument ? `${instrument.ticker} run — InvestIQ AI` : "Committee run — InvestIQ AI",
  };
}

function notFound() {
  return (
    <EmptyState
      icon={FileSearch}
      heading="Run not found"
      sentence="This analysis run doesn't exist or has been removed."
      action={
        <Button asChild>
          <Link href="/committee">Back to Committee</Link>
        </Button>
      }
    />
  );
}

/**
 * Read-only view of ONE past Committee / Buy Analysis / Sell Analysis run,
 * by AiAnalysis id (ui-spec §6.5). Ownership-checked — a client-supplied id
 * is never trusted on its own — and honestly "not found" for anything that
 * doesn't belong to the signed-in user, was never one of these three types,
 * or (rare schema drift) no longer parses against its type's current schema.
 */
export default async function CommitteeHistoryPage({
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

  const row = await prisma.aiAnalysis.findFirst({ where: { id, userId } });
  if (!row || !HISTORY_TYPES.includes(row.type as (typeof HISTORY_TYPES)[number])) {
    return notFound();
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: row.subjectId } });
  if (!instrument) {
    return notFound();
  }

  const hasAiKey = getAiClient().ok;
  const analysis = { createdAt: row.createdAt, model: row.model, dataAsOf: row.dataAsOf };

  const backLink = (
    <Link
      href="/committee"
      className="text-sm text-slate-500 hover:underline dark:text-slate-400"
    >
      ← Back to Committee
    </Link>
  );

  const heading = (
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <h1 className="font-mono text-2xl font-semibold">{instrument.ticker}</h1>
      <span className="text-lg text-slate-600 dark:text-slate-400">{instrument.name}</span>
    </div>
  );

  if (row.type === "COMMITTEE") {
    const parsed = committeeOutputSchema.safeParse(row.output);
    if (!parsed.success) return notFound();
    return (
      <div className="space-y-4">
        {backLink}
        {heading}
        <CommitteeResultPanel
          instrumentId={instrument.id}
          hasKey={hasAiKey}
          analysis={analysis}
          output={parsed.data}
          readOnly
        />
      </div>
    );
  }

  if (row.type === "BUY_ANALYSIS") {
    const parsed = buyAnalysisSchema.safeParse(row.output);
    if (!parsed.success) return notFound();

    const ref = {
      id: instrument.id,
      ticker: instrument.ticker,
      market: instrument.market,
      currency: instrument.currency,
    };
    const quoteResult = await getQuote(ref);
    const currentPrice: CurrentPriceInfo = quoteResult.ok
      ? {
          ok: true,
          price: quoteResult.data.price,
          currency: quoteResult.data.currency,
          badge: badgePropsForValueSource({
            kind: quoteResult.data.source,
            asOf: quoteResult.data.asOf,
          }),
        }
      : { ok: false, reason: quoteResult.message ?? quoteResult.unavailable };

    return (
      <div className="space-y-4">
        {backLink}
        {heading}
        <BuyAnalysisPanel
          instrumentId={instrument.id}
          instrumentCurrency={instrument.currency}
          hasKey={hasAiKey}
          analysis={analysis}
          output={parsed.data}
          currentPrice={currentPrice}
          readOnly
        />
      </div>
    );
  }

  // SELL_ANALYSIS
  const parsed = sellAnalysisSchema.safeParse(row.output);
  if (!parsed.success) return notFound();
  return (
    <div className="space-y-4">
      {backLink}
      {heading}
      <SellAnalysisPanel
        instrumentId={instrument.id}
        hasKey={hasAiKey}
        analysis={analysis}
        output={parsed.data}
        readOnly
      />
    </div>
  );
}
