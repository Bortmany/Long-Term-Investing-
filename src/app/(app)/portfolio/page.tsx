import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badgeForPriceSource, resolveProviderName } from "@/lib/data";
import {
  computePortfolioValue,
  convertAmount,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type PriceInput,
} from "@/lib/portfolio";
import { badgePropsForValueSources } from "@/components/source-badge";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import type {
  HoldingRowData,
  InstrumentOptionData,
  TransactionRowData,
} from "@/components/portfolio/types";

export const metadata = { title: "Portfolio — InvestIQ AI" };

// /portfolio — the real, editable record of every holding and transaction.
// This server page loads and values everything (scoped to the signed-in
// user), converts Prisma Decimals at the edge, and hands plain serializable
// rows to the client view. Golden rule: every figure carries its source, and
// anything that can't be valued is passed down as an honest "not ok" branch
// for the UI to SAY, never a padded number.
export default async function PortfolioPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // The user's portfolio (oldest one is "the" portfolio — single-portfolio
  // app for now). A brand-new account may have none yet; the create action
  // makes one on first use, so here we just treat "no portfolio" as empty.
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  const base = portfolio?.baseCurrency ?? "OMR";

  const transactionRows = portfolio
    ? await prisma.transaction.findMany({
        where: { portfolioId: portfolio.id },
        include: { instrument: { select: { ticker: true } } },
        // Newest first, per the spec; same-day rows fall back to entry order.
        orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }],
      })
    : [];

  const heldInstrumentIds = [
    ...new Set(
      transactionRows
        .map((t) => t.instrumentId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [priceRows, fxRows, instrumentRows] = await Promise.all([
    prisma.priceCache.findMany({
      where: { instrumentId: { in: heldInstrumentIds } },
    }),
    prisma.fxRate.findMany(),
    // The Add Transaction dialog picks from ALL tracked instruments.
    prisma.instrument.findMany({ orderBy: { ticker: "asc" } }),
  ]);

  const transactions = transactionRows.map(fromPrismaTransaction);
  const prices = priceRows.map(fromPrismaPriceCache);
  const fxRates = fxRows.map(fromPrismaFxRate);

  const portfolioValue = computePortfolioValue({
    transactions,
    prices,
    fxRates,
    baseCurrency: base,
  });

  // Latest known price per instrument — shown in its own currency even when
  // a missing FX rate stops the market-value conversion.
  const latestPrice = new Map<string, PriceInput>();
  for (const price of prices) {
    const existing = latestPrice.get(price.instrumentId);
    if (!existing || price.asOf > existing.asOf) {
      latestPrice.set(price.instrumentId, price);
    }
  }

  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));
  const fmpApiKey = process.env.FMP_API_KEY || null;

  const holdings: HoldingRowData[] = portfolioValue.holdings.map((holding) => {
    const instrument = instrumentById.get(holding.instrumentId);
    const price = latestPrice.get(holding.instrumentId);

    // Unrealized gain/loss = market value minus cost basis, both in the base
    // currency. Cost basis is in the trade currency, so it needs its own FX
    // conversion — and its own honest "missing rate" branch.
    let gainLoss: HoldingRowData["gainLoss"];
    if (!holding.valuation.ok) {
      gainLoss = { ok: false, reason: holding.valuation.reason };
    } else {
      const costInBase = convertAmount(
        holding.costBasis,
        holding.currency,
        base,
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

    return {
      instrumentId: holding.instrumentId,
      ticker: instrument?.ticker ?? "—",
      name: instrument?.name ?? "Unknown instrument",
      quantity: holding.quantity,
      currency: holding.currency,
      avgCost: holding.avgCostPerUnit,
      price: price
        ? {
            ok: true,
            value: price.price,
            currency: price.currency,
            source: { kind: badgeForPriceSource(price.source), asOf: price.asOf },
          }
        : { ok: false },
      valuation: holding.valuation.ok
        ? {
            ok: true,
            marketValue: holding.valuation.marketValue,
            source: holding.valuation.source,
          }
        : { ok: false, reason: holding.valuation.reason },
      gainLoss,
      weightPct:
        holding.valuation.ok && portfolioValue.totalValue > 0
          ? (holding.valuation.marketValue / portfolioValue.totalValue) * 100
          : null,
      // Decided server-side: the kebab only offers "Update price" for
      // instruments the manual provider prices (live ones price themselves).
      manualPricing: instrument
        ? resolveProviderName(instrument.market, fmpApiKey) === "manual"
        : true,
    };
  });

  // Biggest positions first; rows that couldn't be valued sink to the end.
  holdings.sort((a, b) => {
    const av = a.valuation.ok ? a.valuation.marketValue : -1;
    const bv = b.valuation.ok ? b.valuation.marketValue : -1;
    return bv - av;
  });

  const transactionData: TransactionRowData[] = transactionRows.map((t) => ({
    id: t.id,
    type: t.type,
    instrumentId: t.instrumentId,
    ticker: t.instrument?.ticker ?? null,
    quantity: t.quantity === null ? null : t.quantity.toNumber(),
    pricePerUnit: t.pricePerUnit === null ? null : t.pricePerUnit.toNumber(),
    amount: t.amount.toNumber(),
    currency: t.currency,
    fee: t.fee.toNumber(),
    tradeDate: t.tradeDate,
    note: t.note,
  }));

  const instrumentOptions: InstrumentOptionData[] = instrumentRows.map((i) => ({
    id: i.id,
    ticker: i.ticker,
    name: i.name,
    currency: i.currency,
    market: i.market,
  }));

  return (
    <PortfolioView
      baseCurrency={base}
      holdings={holdings}
      transactions={transactionData}
      instruments={instrumentOptions}
      aggregateBadge={badgePropsForValueSources(portfolioValue.sources)}
    />
  );
}
