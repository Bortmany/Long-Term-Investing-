// Portfolio valuation. Every figure carries its data source through the
// types so the UI can always show the right badge (golden rule).
// Anything that cannot be valued (missing price, missing FX rate) is listed
// in `missing` and excluded from the total — never guessed.

import type { Currency } from "@prisma/client";
import { badgeForPriceSource } from "@/lib/data/provider";
import { convertAmount, type ConversionResult } from "./fx";
import {
  computeCashBalances,
  computeHoldings,
  type CashBalance,
  type Holding,
} from "./holdings";
import type { FxRateInput, PriceInput, TxnInput, ValueSource } from "./types";

export type HoldingValuation =
  | {
      ok: true;
      /** Market value in the portfolio base currency. */
      marketValue: number;
      /** The price used, in its own currency. */
      price: number;
      priceCurrency: Currency;
      /** Badge + as-of of the price used. */
      source: ValueSource;
      /** As-of date of the FX rate applied; null when no conversion was needed. */
      fxRateAsOf: Date | null;
    }
  | { ok: false; reason: "missing_price" }
  | { ok: false; reason: "missing_fx_rate"; from: Currency; to: Currency };

export type ValuedHolding = Holding & { valuation: HoldingValuation };

export type ValuedCash = CashBalance & { converted: ConversionResult };

export type MissingValuation = {
  instrumentId?: string;
  currency?: Currency;
  reason: "missing_price" | "missing_fx_rate";
};

export type PortfolioValue = {
  baseCurrency: Currency;
  holdings: ValuedHolding[];
  cash: ValuedCash[];
  /** Cash total in base currency (only the convertible part). */
  cashValue: number;
  /** Holdings total in base currency (only the valued part). */
  holdingsValue: number;
  /** cashValue + holdingsValue. */
  totalValue: number;
  /** False when anything could not be valued — the UI must say so. */
  complete: boolean;
  missing: MissingValuation[];
  /** Distinct market-data sources contributing to totalValue. */
  sources: ValueSource[];
};

export function computePortfolioValue(input: {
  transactions: TxnInput[];
  /** Latest known price per instrument (one entry per instrumentId). */
  prices: PriceInput[];
  fxRates: FxRateInput[];
  baseCurrency: Currency;
}): PortfolioValue {
  const { transactions, prices, fxRates, baseCurrency } = input;

  const priceByInstrument = new Map<string, PriceInput>();
  for (const price of prices) {
    const existing = priceByInstrument.get(price.instrumentId);
    if (!existing || price.asOf > existing.asOf) {
      priceByInstrument.set(price.instrumentId, price);
    }
  }

  const missing: MissingValuation[] = [];
  const sources: ValueSource[] = [];
  const seenSources = new Set<string>();

  function trackSource(source: ValueSource) {
    const key =
      source.kind === "derived"
        ? "derived"
        : `${source.kind}:${source.asOf.toISOString()}`;
    if (!seenSources.has(key)) {
      seenSources.add(key);
      sources.push(source);
    }
  }

  // --- Holdings ---
  const holdings = computeHoldings(transactions);
  let holdingsValue = 0;
  const valuedHoldings: ValuedHolding[] = holdings.map((holding) => {
    const price = priceByInstrument.get(holding.instrumentId);
    if (!price) {
      missing.push({ instrumentId: holding.instrumentId, reason: "missing_price" });
      return { ...holding, valuation: { ok: false, reason: "missing_price" } };
    }

    const localValue = holding.quantity * price.price;
    const converted = convertAmount(localValue, price.currency, baseCurrency, fxRates);
    if (!converted.ok) {
      missing.push({
        instrumentId: holding.instrumentId,
        currency: price.currency,
        reason: "missing_fx_rate",
      });
      return {
        ...holding,
        valuation: {
          ok: false,
          reason: "missing_fx_rate",
          from: converted.missingRate.from,
          to: converted.missingRate.to,
        },
      };
    }

    const source: ValueSource = {
      kind: badgeForPriceSource(price.source),
      asOf: price.asOf,
    };
    trackSource(source);
    holdingsValue += converted.value;
    return {
      ...holding,
      valuation: {
        ok: true,
        marketValue: converted.value,
        price: price.price,
        priceCurrency: price.currency,
        source,
        fxRateAsOf: converted.rateAsOf,
      },
    };
  });

  // --- Cash (derived from transactions) ---
  const cashBalances = computeCashBalances(transactions);
  let cashValue = 0;
  const valuedCash: ValuedCash[] = cashBalances.map((balance) => {
    const converted = convertAmount(
      balance.amount,
      balance.currency,
      baseCurrency,
      fxRates,
    );
    if (converted.ok) {
      cashValue += converted.value;
      trackSource({ kind: "derived" });
    } else {
      missing.push({ currency: balance.currency, reason: "missing_fx_rate" });
    }
    return { ...balance, converted };
  });

  return {
    baseCurrency,
    holdings: valuedHoldings,
    cash: valuedCash,
    cashValue,
    holdingsValue,
    totalValue: holdingsValue + cashValue,
    complete: missing.length === 0,
    missing,
    sources,
  };
}
