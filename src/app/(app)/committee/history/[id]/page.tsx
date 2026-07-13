import type { ReactNode } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buyAnalysisSchema,
  committeeSchema,
  sellAnalysisSchema,
} from "@/lib/ai/schemas";
import { getQuote, type InstrumentRef } from "@/lib/data";
import { badgePropsForValueSource } from "@/components/source-badge";
import { AiPanel } from "@/components/ai-panel";
import {
  BuyResultBody,
  CommitteeResultBody,
  SellResultBody,
} from "@/components/committee/committee-result";

export const metadata = { title: "Past Run — InvestIQ AI" };

// /committee/history/[id] — a single historical Committee/Buy/Sell run,
// read-only (ui-spec §6.5's last paragraph). These outputs can embed the
// user's own private thesis wording and position size, so the row is scoped to
// the signed-in user: another user's run id resolves to notFound(), never a
// readable page.
export default async function CommitteeHistoryPage({
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

  const row = await prisma.aiAnalysis.findFirst({ where: { id, userId } });
  if (!row || (row.type !== "COMMITTEE" && row.type !== "BUY_ANALYSIS" && row.type !== "SELL_ANALYSIS")) {
    notFound();
  }

  const analysis = { createdAt: row.createdAt, model: row.model, dataAsOf: row.dataAsOf };

  // Instruments are shared reference data — subjectId is the instrumentId.
  const instrument = await prisma.instrument.findFirst({ where: { id: row.subjectId } });

  let body: ReactNode;
  let title: string;

  if (row.type === "COMMITTEE") {
    const parsed = committeeSchema.safeParse(row.output);
    if (!parsed.success) notFound();
    title = "Investment Committee";
    body = <CommitteeResultBody output={parsed.data} />;
  } else if (row.type === "BUY_ANALYSIS") {
    const parsed = buyAnalysisSchema.safeParse(row.output);
    if (!parsed.success) notFound();
    title = "Buy Analysis";

    let currentPrice: {
      price: number;
      currency: string;
      badge: ReturnType<typeof badgePropsForValueSource>;
    } | null = null;
    if (instrument) {
      const ref: InstrumentRef = {
        id: instrument.id,
        ticker: instrument.ticker,
        market: instrument.market,
        currency: instrument.currency,
      };
      const quoteR = await getQuote(ref);
      if (quoteR.ok) {
        currentPrice = {
          price: quoteR.data.price,
          currency: quoteR.data.currency,
          badge: badgePropsForValueSource({ kind: quoteR.data.source, asOf: quoteR.data.asOf }),
        };
      }
    }
    body = (
      <BuyResultBody
        output={parsed.data}
        currentPrice={currentPrice}
        instrumentCurrency={instrument?.currency ?? currentPrice?.currency ?? "USD"}
      />
    );
  } else {
    const parsed = sellAnalysisSchema.safeParse(row.output);
    if (!parsed.success) notFound();
    title = "Sell Analysis";
    body = <SellResultBody output={parsed.data} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/committee?instrument=${row.subjectId}`}
        className="text-sm text-slate-500 hover:underline dark:text-slate-400"
      >
        ← Back to Committee
      </Link>

      <AiPanel
        readOnly
        hasKey
        title={title}
        actionLabel=""
        pendingLabel=""
        analysis={analysis}
        isPending={false}
      >
        {body}
      </AiPanel>
    </div>
  );
}
