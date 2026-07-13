// Manual provider — serves manually entered and seeded prices from PriceCache.
//
// Used for MSX / TADAWUL / DFM / OTHER instruments, and for US instruments
// when no FMP key is configured. It only ever returns what a human (or the
// seed script) stored, with the honest badge ("manual" or "sample") and
// as-of date attached. It never invents data: anything not in the cache is
// a typed "unavailable" result.

import type { Currency, PriceSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  badgeForPriceSource,
  type DataResult,
  type InstrumentRef,
  type MarketDataProvider,
  type PricePoint,
  type Quote,
  unavailable,
} from "./provider";

export type StoredPrice = {
  price: number;
  currency: Currency;
  asOf: Date;
  source: PriceSource;
  fetchedAt: Date;
};

/** Narrow storage port so unit tests can run without a database. */
export interface ManualPriceStore {
  getLatestPrice(instrumentId: string): Promise<StoredPrice | null>;
  getPriceHistory(
    instrumentId: string,
    from: Date,
    to: Date,
  ): Promise<StoredPrice[]>;
}

export function createPrismaPriceStore(): ManualPriceStore {
  return {
    async getLatestPrice(instrumentId) {
      const row = await prisma.priceCache.findFirst({
        where: { instrumentId },
        orderBy: { asOf: "desc" },
      });
      if (!row) return null;
      return {
        price: row.price.toNumber(),
        currency: row.currency,
        asOf: row.asOf,
        source: row.source,
        fetchedAt: row.fetchedAt,
      };
    },
    async getPriceHistory(instrumentId, from, to) {
      const rows = await prisma.priceCache.findMany({
        where: { instrumentId, asOf: { gte: from, lte: to } },
        orderBy: { asOf: "asc" },
      });
      return rows.map((row) => ({
        price: row.price.toNumber(),
        currency: row.currency,
        asOf: row.asOf,
        source: row.source,
        fetchedAt: row.fetchedAt,
      }));
    },
  };
}

export function createManualProvider(
  store: ManualPriceStore = createPrismaPriceStore(),
): MarketDataProvider {
  return {
    name: "manual",

    async getQuote(instrument: InstrumentRef): Promise<DataResult<Quote>> {
      const latest = await store.getLatestPrice(instrument.id);
      if (!latest) {
        return unavailable(
          "no_data",
          `No manually entered price for ${instrument.ticker} yet.`,
        );
      }
      return {
        ok: true,
        data: {
          price: latest.price,
          currency: latest.currency,
          asOf: latest.asOf,
          source: badgeForPriceSource(latest.source),
          fetchedAt: latest.fetchedAt,
        },
      };
    },

    async getPriceHistory(
      instrument: InstrumentRef,
      range: { from: Date; to: Date },
    ): Promise<DataResult<PricePoint[]>> {
      const rows = await store.getPriceHistory(
        instrument.id,
        range.from,
        range.to,
      );
      if (rows.length === 0) {
        return unavailable(
          "no_data",
          `No stored prices for ${instrument.ticker} in that period.`,
        );
      }
      return {
        ok: true,
        data: rows.map((row) => ({
          date: row.asOf,
          close: row.price,
          currency: row.currency,
          source: badgeForPriceSource(row.source),
        })),
      };
    },

    // The manual provider has no external source for the following — it
    // answers with a typed unavailable result rather than made-up data.
    async getProfile() {
      return unavailable("not_supported", "Profiles require a market data provider.");
    },
    async getFinancialStatements() {
      return unavailable("not_supported", "Financial statements require a market data provider.");
    },
    async getDividendHistory() {
      return unavailable("not_supported", "Dividend history requires a market data provider.");
    },
    async getUpcomingDividends() {
      return unavailable("not_supported", "Upcoming dividends require a market data provider.");
    },
    async getStockNews() {
      return unavailable("not_supported", "News requires a live market-data connection.");
    },
  };
}
