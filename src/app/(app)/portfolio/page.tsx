import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Currency, InstrumentType, Market, TransactionType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badgeForPriceSource, resolveProviderName } from "@/lib/data";
import {
  convertAmount,
  fromPrismaTransaction,
  type PriceInput,
} from "@/lib/portfolio";
import { loadPortfolioComputation } from "@/lib/portfolio-market-data";
import { badgePropsForValueSources } from "@/components/source-badge";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import type {
  HoldingRowData,
  InstrumentOptionData,
  TransactionRowData,
} from "@/components/portfolio/types";
import {
  HealthScorePanel,
  parseHealthScoreAnalysis,
} from "@/components/health/health-score-panel";

export const metadata = { title: "Portfolio — InvestIQ AI" };

// /portfolio — the real, editable record of every holding and transaction.
// This page stays a server component: it loads the signed-in user's data,
// converts Prisma Decimals to plain numbers at the edge, values every
// holding through the pure portfolio math (golden rule: unvalued rows are
// SAID to be unavailable, never padded), then hands plain data to the
// client-side view that owns the dialogs and filters.
export default async function PortfolioPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // Every user-owned query is scoped to the session user's id. ONE shared
  // computation with the Dashboard (same transactions, same order, same
  // valuation — including this user's own manual price/FX overrides only) so
  // the two pages' totals always agree. Null means no portfolio yet.
  const computation = await loadPortfolioComputation(session.user.id);

  // Instruments are shared reference data (no userId column) — the dialog's
  // pickers list all of them.
  const instrumentRows = await prisma.instrument.findMany({
    orderBy: { ticker: "asc" },
  });
  const instruments: InstrumentOptionData[] = instrumentRows.map((i) => ({
    id: i.id,
    ticker: i.ticker,
    name: i.name,
    currency: i.currency,
    market: i.market,
  }));
  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));

  // Enum option lists come from the schema itself (Object.values), never
  // hand-typed on the client, so they can't drift from what Prisma allows —
  // same pattern the Settings page already uses for Currency.
  const currencies = Object.values(Currency);
  const markets = Object.values(Market);
  const instrumentTypes = Object.values(InstrumentType);
  const transactionTypes = Object.values(TransactionType);

  // No portfolio yet (brand-new account): the view shows the empty state and
  // the first createTransaction call will create the portfolio.
  if (!computation) {
    return (
      <PortfolioView
        baseCurrency="OMR"
        holdings={[]}
        holdingsBadge={{ variant: "derived" }}
        transactions={[]}
        instruments={instruments}
        currencies={currencies}
        markets={markets}
        instrumentTypes={instrumentTypes}
        transactionTypes={transactionTypes}
      />
    );
  }

  const { portfolio, transactionRows, prices, fxRates, portfolioValue } =
    computation;
  const base = portfolio.baseCurrency;

  // Latest known price per instrument (for the Current Price column).
  const latestPriceByInstrument = new Map<string, PriceInput>();
  for (const price of prices) {
    const existing = latestPriceByInstrument.get(price.instrumentId);
    if (!existing || price.asOf > existing.asOf) {
      latestPriceByInstrument.set(price.instrumentId, price);
    }
  }

  // Whether an instrument's price comes from the manual provider decides if
  // the row gets an "Update price" action. Decided here on the server — the
  // FMP key itself never leaves this file, only the yes/no answer.
  const fmpApiKey = process.env.FMP_API_KEY || null;

  const totalValue = portfolioValue.totalValue;
  const holdings: HoldingRowData[] = portfolioValue.holdings.map((holding) => {
    const instrument = instrumentById.get(holding.instrumentId);
    const latestPrice = latestPriceByInstrument.get(holding.instrumentId);

    const price: HoldingRowData["price"] = latestPrice
      ? {
          ok: true,
          value: latestPrice.price,
          currency: latestPrice.currency,
          source: {
            kind: badgeForPriceSource(latestPrice.source),
            asOf: latestPrice.asOf,
          },
        }
      : { ok: false };

    const valuation: HoldingRowData["valuation"] = holding.valuation.ok
      ? {
          ok: true,
          marketValue: holding.valuation.marketValue,
          source: holding.valuation.source,
        }
      : { ok: false, reason: holding.valuation.reason };

    // Unrealized gain/loss = market value (base currency) − cost basis
    // converted to base. A missing FX rate makes this honestly unavailable —
    // never a silent 1.0 conversion.
    let gainLoss: HoldingRowData["gainLoss"];
    if (!holding.valuation.ok) {
      gainLoss = { ok: false, reason: holding.valuation.reason };
    } else {
      const cost = convertAmount(holding.costBasis, holding.currency, base, fxRates);
      if (!cost.ok) {
        gainLoss = { ok: false, reason: "missing_fx_rate" };
      } else {
        const amount = holding.valuation.marketValue - cost.value;
        gainLoss = {
          ok: true,
          amount,
          pct: cost.value > 0 ? (amount / cost.value) * 100 : null,
        };
      }
    }

    return {
      instrumentId: holding.instrumentId,
      ticker: instrument?.ticker ?? "—",
      name: instrument?.name ?? "Unknown instrument",
      quantity: holding.quantity,
      currency: holding.currency,
      avgCost: holding.avgCostPerUnit,
      price,
      valuation,
      gainLoss,
      weightPct:
        holding.valuation.ok && totalValue > 0
          ? (holding.valuation.marketValue / totalValue) * 100
          : null,
      manualPricing: instrument
        ? resolveProviderName(instrument.market, fmpApiKey) !== "fmp"
        : true,
    };
  });

  // Largest positions first; unvalued rows sink to the bottom (same order
  // the Dashboard uses).
  holdings.sort((a, b) => {
    const av = a.valuation.ok ? a.valuation.marketValue : -1;
    const bv = b.valuation.ok ? b.valuation.marketValue : -1;
    return bv - av;
  });

  const transactionData: TransactionRowData[] = transactionRows.map((t) => ({
    ...fromPrismaTransaction(t),
    id: t.id,
    ticker: t.instrumentId
      ? (instrumentById.get(t.instrumentId)?.ticker ?? null)
      : null,
    note: t.note,
  }));

  // Health Score: read whatever is already stored — this page never
  // generates one itself (THE AI RULE, docs/CONVENTIONS.md).
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
      <PortfolioView
        baseCurrency={base}
        holdings={holdings}
        holdingsBadge={badgePropsForValueSources(portfolioValue.sources)}
        weightsNote={
          portfolioValue.cashValue < 0
            ? "Cash is negative (recorded spending exceeds deposits), so holdings are shown against a smaller total and can add up to more than 100%."
            : undefined
        }
        transactions={transactionData}
        instruments={instruments}
        currencies={currencies}
        markets={markets}
        instrumentTypes={instrumentTypes}
        transactionTypes={transactionTypes}
      />
      <HealthScorePanel
        analysis={healthScoreAnalysis}
        hasKey={hasAnthropicKey}
        className="mt-6"
      />
    </>
  );
}
