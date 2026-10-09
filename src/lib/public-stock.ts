// Decides what a PUBLIC stock page may show. Golden rule: no fabricated
// number. At launch this never returns a price (every licence switch is off).
//
// This module reads ONLY the public list, the shared Instrument table and the
// shared PriceCache table. It deliberately imports nothing about users,
// portfolios, transactions, watchlists, typed-in prices, AI, sessions, or the
// live price provider (tests/unit/public-stock.test.ts checks the imports).

import type { Currency, PriceSource } from "@prisma/client";

import { isPublicDisplayAllowed } from "@/lib/data/provider-info";
import {
  resolvePublicStocks,
  type PublicEntry,
  type PublicInstrumentSource,
} from "@/lib/public-catalogue";

/** A stored price older than this is treated as "no price" on a public page. */
export const PUBLIC_PRICE_MAX_AGE_DAYS = 7;

/** One stored price row as the page reads it (shared table, never a user's). */
export type StoredPriceRow = {
  price: number;
  currency: Currency;
  asOf: Date;
  source: PriceSource;
};

export type PublicPriceDecision =
  | { kind: "sign_in" }
  | {
      kind: "price";
      price: number;
      currency: Currency;
      asOf: Date;
      source: "FMP" | "TWELVE_DATA";
    };

/**
 * Pure: may this stored price be shown to a signed-out visitor?
 * No row, a stale row, a different currency, MANUAL/SEED (always), or a source
 * whose licence switch is off all give the same "sign in" answer.
 */
export function decidePublicPrice(
  row: StoredPriceRow | null,
  entry: Pick<PublicEntry, "currency">,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): PublicPriceDecision {
  if (!row) return { kind: "sign_in" };
  // Belt and braces: even if the licence check were ever wrong, a typed-in or
  // sample price never reaches a public page.
  if (row.source !== "FMP" && row.source !== "TWELVE_DATA") return { kind: "sign_in" };
  if (!isPublicDisplayAllowed(row.source, env)) return { kind: "sign_in" };
  if (row.currency !== entry.currency) return { kind: "sign_in" };
  if (!Number.isFinite(row.price) || row.price <= 0) return { kind: "sign_in" };
  const ageMs = now.getTime() - row.asOf.getTime();
  if (ageMs > PUBLIC_PRICE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return { kind: "sign_in" };
  return {
    kind: "price",
    price: row.price,
    currency: row.currency,
    asOf: row.asOf,
    source: row.source,
  };
}

/** The slice of the database the page data function uses. */
export type PublicStockDb = PublicInstrumentSource & {
  priceCache: {
    findFirst(args: {
      where: { instrumentId: string };
      orderBy: { asOf: "desc" }[];
      select: { price: true; currency: true; asOf: true; source: true };
    }): Promise<{
      price: { toNumber(): number } | number;
      currency: Currency;
      asOf: Date;
      source: PriceSource;
    } | null>;
  };
};

export type PublicStockPageData =
  | { ok: false; reason: "not_found" }
  | { ok: true; entry: PublicEntry; price: PublicPriceDecision };

/**
 * Everything the page needs, in one place. The caller has already matched the
 * address against the public list (no database call before that). The newest
 * stored price is read straight from PriceCache, never from a provider.
 */
export async function getPublicStockPageData(
  db: PublicStockDb,
  entry: PublicEntry,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicStockPageData> {
  const [resolved] = await resolvePublicStocks(db, entry);
  if (!resolved) return { ok: false, reason: "not_found" };

  const row = await db.priceCache.findFirst({
    where: { instrumentId: resolved.instrumentId },
    orderBy: [{ asOf: "desc" }],
    select: { price: true, currency: true, asOf: true, source: true },
  });
  const stored: StoredPriceRow | null = row
    ? {
        price: typeof row.price === "number" ? row.price : row.price.toNumber(),
        currency: row.currency,
        asOf: row.asOf,
        source: row.source,
      }
    : null;
  return { ok: true, entry, price: decidePublicPrice(stored, entry, now, env) };
}
