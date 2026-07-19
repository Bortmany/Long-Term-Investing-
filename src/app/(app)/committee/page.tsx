import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/data";
import { getAiClient } from "@/lib/ai/client";
import {
  buyAnalysisSchema,
  committeeOutputSchema,
  sellAnalysisSchema,
  type BuyAnalysisOutput,
  type CommitteeOutput,
  type SellAnalysisOutput,
} from "@/lib/ai/schemas";
import { badgePropsForValueSource } from "@/components/source-badge";
import {
  computeHoldings,
  fromPrismaTransaction,
} from "@/lib/portfolio";
import {
  CommitteeInstrumentPicker,
  type CommitteeMode,
  type CommitteePosition,
} from "@/components/committee/committee-instrument-picker";
import { CommitteeResultPanel } from "@/components/committee/committee-result-panel";
import { BuyAnalysisPanel, type CurrentPriceInfo } from "@/components/committee/buy-analysis-panel";
import { SellAnalysisPanel } from "@/components/committee/sell-analysis-panel";
import { PastRunsTable, type PastRunRow } from "@/components/committee/past-runs-table";

export const metadata = { title: "Committee — InvestIQ AI" };

const VALID_MODES: CommitteeMode[] = ["committee", "buy", "sell"];

function parseMode(raw: string | undefined): CommitteeMode {
  return VALID_MODES.includes(raw as CommitteeMode) ? (raw as CommitteeMode) : "committee";
}

// /committee — one workspace for three related AI analyses on a chosen
// instrument (ui-spec §6.1): the full committee debate, a Buy Analysis, or a
// Sell Analysis. Reads `?instrument=&mode=` from the URL (set by the
// Portfolio holdings row's "Sell analysis" link) to pre-select both.
export default async function CommitteePage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string; mode?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const { instrument: instrumentParam, mode: modeParam } = await searchParams;
  const mode = parseMode(modeParam);

  const [instruments, portfolio] = await Promise.all([
    prisma.instrument.findMany({ orderBy: { ticker: "asc" } }),
    prisma.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);
  const hasAiKey = getAiClient().ok;

  const selectedInstrumentId = instruments.some((i) => i.id === instrumentParam)
    ? (instrumentParam as string)
    : null;

  // Currently-held instruments (positive quantity, average-cost method) —
  // drives the Sell tab's disabled state and the position-context line.
  let heldInstrumentIds: string[] = [];
  let position: CommitteePosition | null = null;
  if (portfolio) {
    const transactions = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id, instrumentId: { not: null } },
    });
    const holdings = computeHoldings(transactions.map(fromPrismaTransaction));
    heldInstrumentIds = holdings.map((h) => h.instrumentId);

    if (selectedInstrumentId) {
      const holding = holdings.find((h) => h.instrumentId === selectedInstrumentId);
      if (holding) {
        position = {
          quantity: holding.quantity,
          avgCostPerUnit: holding.avgCostPerUnit,
          currency: holding.currency,
          gainLossPct: null, // filled in below once the quote is known
        };
      }
    }
  }

  let activeThesisTicker: string | null = null;
  let currentPrice: CurrentPriceInfo = { ok: false, reason: "no stock selected" };
  let analysisRow: Awaited<ReturnType<typeof prisma.aiAnalysis.findFirst>> = null;
  let pastRuns: PastRunRow[] = [];
  let selectedInstrumentCurrency = "USD";

  if (selectedInstrumentId) {
    const instrument = instruments.find((i) => i.id === selectedInstrumentId)!;
    selectedInstrumentCurrency = instrument.currency;
    const ref = {
      id: instrument.id,
      ticker: instrument.ticker,
      market: instrument.market,
      currency: instrument.currency,
    };

    const [quoteResult, activeThesis, storedAnalysis, pastRunRows] = await Promise.all([
      getQuote(ref),
      prisma.thesis.findFirst({
        where: { userId, instrumentId: instrument.id, status: "ACTIVE" },
      }),
      prisma.aiAnalysis.findFirst({
        where: {
          userId,
          type:
            mode === "committee" ? "COMMITTEE" : mode === "buy" ? "BUY_ANALYSIS" : "SELL_ANALYSIS",
          subjectType: "instrument",
          subjectId: instrument.id,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.aiAnalysis.findMany({
        where: {
          userId,
          subjectType: "instrument",
          subjectId: instrument.id,
          type: { in: ["COMMITTEE", "BUY_ANALYSIS", "SELL_ANALYSIS"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    activeThesisTicker = activeThesis ? instrument.ticker : null;
    analysisRow = storedAnalysis;
    pastRuns = pastRunRows.map((row) => ({
      id: row.id,
      type: row.type as PastRunRow["type"],
      model: row.model,
      createdAt: row.createdAt,
      output: row.output,
    }));

    currentPrice = quoteResult.ok
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

    if (position && position.avgCostPerUnit && position.avgCostPerUnit > 0 && quoteResult.ok) {
      position = {
        ...position,
        gainLossPct:
          ((quoteResult.data.price - position.avgCostPerUnit) / position.avgCostPerUnit) * 100,
      };
    }
  }

  // The caption only appears alongside content that actually parsed — a
  // stored row whose output no longer matches its type's current schema
  // (e.g. the schema shape changed since it was saved) shows as "no
  // analysis yet" rather than a caption with nothing underneath it, same
  // discipline as /theses/[id]'s Latest Check panel.
  let analysisCaption: { createdAt: Date; model: string; dataAsOf: Date } | null = null;
  let committeeOutput: CommitteeOutput | null = null;
  let buyOutput: BuyAnalysisOutput | null = null;
  let sellOutput: SellAnalysisOutput | null = null;

  if (analysisRow) {
    const caption = {
      createdAt: analysisRow.createdAt,
      model: analysisRow.model,
      dataAsOf: analysisRow.dataAsOf,
    };
    if (mode === "committee") {
      const parsed = committeeOutputSchema.safeParse(analysisRow.output);
      if (parsed.success) {
        committeeOutput = parsed.data;
        analysisCaption = caption;
      }
    } else if (mode === "buy") {
      const parsed = buyAnalysisSchema.safeParse(analysisRow.output);
      if (parsed.success) {
        buyOutput = parsed.data;
        analysisCaption = caption;
      }
    } else {
      const parsed = sellAnalysisSchema.safeParse(analysisRow.output);
      if (parsed.success) {
        sellOutput = parsed.data;
        analysisCaption = caption;
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Investment Committee</h1>

      <CommitteeInstrumentPicker
        instruments={instruments.map((i) => ({ id: i.id, ticker: i.ticker, name: i.name }))}
        heldInstrumentIds={heldInstrumentIds}
        selectedInstrumentId={selectedInstrumentId}
        mode={mode}
        hasAiKey={hasAiKey}
        position={position}
        activeThesisTicker={activeThesisTicker}
      />

      {selectedInstrumentId ? (
        <>
          {mode === "committee" ? (
            <CommitteeResultPanel
              instrumentId={selectedInstrumentId}
              hasKey={hasAiKey}
              analysis={analysisCaption}
              output={committeeOutput}
            />
          ) : null}
          {mode === "buy" ? (
            <BuyAnalysisPanel
              instrumentId={selectedInstrumentId}
              instrumentCurrency={selectedInstrumentCurrency}
              hasKey={hasAiKey}
              analysis={analysisCaption}
              output={buyOutput}
              currentPrice={currentPrice}
            />
          ) : null}
          {mode === "sell" ? (
            <SellAnalysisPanel
              instrumentId={selectedInstrumentId}
              hasKey={hasAiKey}
              analysis={analysisCaption}
              output={sellOutput}
            />
          ) : null}

          <PastRunsTable rows={pastRuns} />
        </>
      ) : null}
    </div>
  );
}
