import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnthropicKey } from "@/lib/ai/client";
import {
  buyAnalysisSchema,
  committeeSchema,
  sellAnalysisSchema,
  type BuyAnalysisOutput,
  type CommitteeOutput,
  type SellAnalysisOutput,
} from "@/lib/ai/schemas";
import { getQuote, type InstrumentRef } from "@/lib/data";
import { badgePropsForValueSource } from "@/components/source-badge";
import {
  computePortfolioValue,
  convertAmount,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
} from "@/lib/portfolio";
import {
  CommitteeWorkspace,
  type CommitteeHistoryRow,
  type CommitteeHoldingInfo,
  type CommitteeInstrumentOption,
  type CommitteeMode,
} from "@/components/committee/committee-workspace";
import type { AiPanelAnalysis } from "@/components/ai-panel";
import type { AiAnalysisType } from "@prisma/client";

export const metadata = { title: "Committee — InvestIQ AI" };

function parseMode(value: string | undefined): CommitteeMode | undefined {
  if (value === "committee" || value === "buy" || value === "sell") return value;
  return undefined;
}

// /committee — one workspace for three related AI analyses on a chosen
// instrument (ui-spec §6). Server component: loads everything scoped to the
// signed-in user and hands plain serializable props to the client shell.
// AI RULE: this page only READS persisted AiAnalysis rows — generation only
// happens from the workspace's explicit button clicks / dialog submit.
export default async function CommitteePage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string; mode?: string }>;
}) {
  const { instrument, mode: modeParam } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const hasKey = hasAnthropicKey();

  // Not restricted to held/watched — Buy Analysis is explicitly for
  // instruments not yet owned (unlike /stocks).
  const instrumentRows = await prisma.instrument.findMany({
    orderBy: { ticker: "asc" },
  });
  const instruments: CommitteeInstrumentOption[] = instrumentRows.map((i) => ({
    id: i.id,
    ticker: i.ticker,
    name: i.name,
    currency: i.currency,
  }));

  const selectedId =
    instrument && instrumentRows.some((i) => i.id === instrument) ? instrument : null;
  const mode = parseMode(modeParam);

  // The oldest portfolio is "the" portfolio. A GET render must never CREATE
  // one as a side effect — read with findFirst and simply show "not held"
  // when there's no portfolio yet.
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // Holdings for ANY instrument the picker might select (quantity/avg-cost/
  // gain-loss), so the position-context line and the Sell-gating both work
  // regardless of which instrument ends up selected.
  const holdingByInstrument = new Map<string, CommitteeHoldingInfo>();
  if (portfolio) {
    const transactionRows = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id },
    });
    const heldInstrumentIds = [
      ...new Set(
        transactionRows
          .map((t) => t.instrumentId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const [priceRows, fxRows] = await Promise.all([
      prisma.priceCache.findMany({ where: { instrumentId: { in: heldInstrumentIds } } }),
      prisma.fxRate.findMany(),
    ]);

    const transactions = transactionRows.map(fromPrismaTransaction);
    const prices = priceRows.map(fromPrismaPriceCache);
    const fxRates = fxRows.map(fromPrismaFxRate);
    const baseCurrency = portfolio.baseCurrency;

    const portfolioValue = computePortfolioValue({
      transactions,
      prices,
      fxRates,
      baseCurrency,
    });

    for (const holding of portfolioValue.holdings) {
      let gainLoss: CommitteeHoldingInfo["gainLoss"];
      if (!holding.valuation.ok) {
        gainLoss = { ok: false, reason: holding.valuation.reason };
      } else {
        const costInBase = convertAmount(
          holding.costBasis,
          holding.currency,
          baseCurrency,
          fxRates,
        );
        if (!costInBase.ok) {
          gainLoss = { ok: false, reason: "missing_fx_rate" };
        } else {
          const amount = holding.valuation.marketValue - costInBase.value;
          gainLoss = {
            ok: true,
            amount,
            pct: costInBase.value > 0 ? (amount / costInBase.value) * 100 : null,
          };
        }
      }

      holdingByInstrument.set(holding.instrumentId, {
        quantity: holding.quantity,
        avgCost: holding.avgCostPerUnit,
        currency: holding.currency,
        valuation: holding.valuation.ok
          ? { ok: true, marketValue: holding.valuation.marketValue }
          : { ok: false, reason: holding.valuation.reason },
        gainLoss,
      });
    }
  }
  const holding = selectedId ? (holdingByInstrument.get(selectedId) ?? null) : null;

  // Active theses, keyed by instrument, so the picker's auto-attach notice
  // knows whether the selected instrument has one.
  const activeTheses = await prisma.thesis.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, instrumentId: true },
  });
  const activeThesisByInstrument = new Map(
    activeTheses.map((t) => [t.instrumentId, t.id]),
  );
  const activeThesisId = selectedId ? (activeThesisByInstrument.get(selectedId) ?? null) : null;

  const history: CommitteeHistoryRow[] = [];
  let latestCommittee: { analysis: AiPanelAnalysis; output: CommitteeOutput } | null = null;
  let latestBuy: { analysis: AiPanelAnalysis; output: BuyAnalysisOutput } | null = null;
  let latestSell: { analysis: AiPanelAnalysis; output: SellAnalysisOutput } | null = null;
  let currentPrice: {
    price: number;
    currency: string;
    badge: ReturnType<typeof badgePropsForValueSource>;
  } | null = null;

  if (selectedId) {
    const selectedInstrumentRow = instrumentRows.find((i) => i.id === selectedId);

    const analysisTypes: AiAnalysisType[] = ["COMMITTEE", "BUY_ANALYSIS", "SELL_ANALYSIS"];
    const rows = await prisma.aiAnalysis.findMany({
      // Scoped to this user: committee/buy/sell outputs can embed the user's own
      // private thesis wording and position size, so another user's runs on the
      // same instrument must never appear here.
      where: {
        userId,
        subjectType: "instrument",
        subjectId: selectedId,
        type: { in: analysisTypes },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const row of rows) {
      if (row.type === "COMMITTEE") {
        const parsed = committeeSchema.safeParse(row.output);
        if (!parsed.success) continue;
        history.push({
          id: row.id,
          createdAt: row.createdAt,
          type: "COMMITTEE",
          model: row.model,
          verdict: parsed.data.verdict,
        });
        if (!latestCommittee) {
          latestCommittee = {
            analysis: { createdAt: row.createdAt, model: row.model, dataAsOf: row.dataAsOf },
            output: parsed.data,
          };
        }
      } else if (row.type === "BUY_ANALYSIS") {
        const parsed = buyAnalysisSchema.safeParse(row.output);
        if (!parsed.success) continue;
        history.push({
          id: row.id,
          createdAt: row.createdAt,
          type: "BUY_ANALYSIS",
          model: row.model,
          score: parsed.data.score,
        });
        if (!latestBuy) {
          latestBuy = {
            analysis: { createdAt: row.createdAt, model: row.model, dataAsOf: row.dataAsOf },
            output: parsed.data,
          };
        }
      } else if (row.type === "SELL_ANALYSIS") {
        const parsed = sellAnalysisSchema.safeParse(row.output);
        if (!parsed.success) continue;
        history.push({
          id: row.id,
          createdAt: row.createdAt,
          type: "SELL_ANALYSIS",
          model: row.model,
          score: parsed.data.sellScore,
        });
        if (!latestSell) {
          latestSell = {
            analysis: { createdAt: row.createdAt, model: row.model, dataAsOf: row.dataAsOf },
            output: parsed.data,
          };
        }
      }
    }

    // This IS a one-instrument context, so the fetching accessor (getQuote)
    // is correct here per the fetch-vs-read-only-cache split.
    if (selectedInstrumentRow) {
      const ref: InstrumentRef = {
        id: selectedInstrumentRow.id,
        ticker: selectedInstrumentRow.ticker,
        market: selectedInstrumentRow.market,
        currency: selectedInstrumentRow.currency,
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
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Committee</h1>
      <CommitteeWorkspace
        // Remount when the URL's instrument/mode changes (a fresh instrument
        // selection — or an incoming ?mode= link like Sell analysis's row
        // action — should always re-initialize activeMode from the URL).
        key={`${selectedId ?? "none"}:${mode ?? "none"}`}
        instruments={instruments}
        selectedId={selectedId}
        mode={mode}
        hasKey={hasKey}
        holding={holding}
        activeThesisId={activeThesisId}
        history={history}
        latestCommittee={latestCommittee}
        latestBuy={latestBuy}
        latestSell={latestSell}
        currentPrice={currentPrice}
      />
    </div>
  );
}
