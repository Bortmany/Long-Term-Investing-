import type {
  Currency,
  FxRate,
  PriceCache,
  PriceSource,
  Transaction,
  TransactionType,
} from "@prisma/client";
import type { SourceBadge } from "@/lib/data/provider";

// ---------------------------------------------------------------------------
// Plain-number inputs for the pure portfolio functions.
// Use the fromPrisma* adapters below to build them from database rows.
// ---------------------------------------------------------------------------

export type TxnInput = {
  type: TransactionType;
  instrumentId: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  /** Always positive; the transaction type gives it its direction. */
  amount: number;
  currency: Currency;
  fee: number;
  tradeDate: Date;
  /**
   * Stable identity used ONLY as a deterministic tie-break when two
   * transactions share a tradeDate (see computeHoldings). Optional so pure
   * unit tests can build fixtures without them; the Prisma adapter always
   * fills them, which is what makes the real pages agree.
   */
  id?: string;
  createdAt?: Date;
};

export type PriceInput = {
  instrumentId: string;
  price: number;
  currency: Currency;
  asOf: Date;
  source: PriceSource;
};

export type FxRateInput = {
  base: Currency;
  quote: Currency;
  /** 1 unit of `base` = `rate` units of `quote`. */
  rate: number;
  asOf: Date;
};

/**
 * Where a displayed figure comes from (source-badge rule).
 * - "derived": computed purely from the user's own recorded transactions.
 * - "live" / "manual" / "sample": uses market data with that badge, as of `asOf`.
 */
export type ValueSource =
  | { kind: "derived" }
  | { kind: SourceBadge; asOf: Date };

// ---------------------------------------------------------------------------
// Adapters from Prisma rows (Decimal → number)
// ---------------------------------------------------------------------------

export function fromPrismaTransaction(t: Transaction): TxnInput {
  return {
    type: t.type,
    instrumentId: t.instrumentId,
    quantity: t.quantity === null ? null : t.quantity.toNumber(),
    pricePerUnit: t.pricePerUnit === null ? null : t.pricePerUnit.toNumber(),
    amount: t.amount.toNumber(),
    currency: t.currency,
    fee: t.fee.toNumber(),
    tradeDate: t.tradeDate,
    id: t.id,
    createdAt: t.createdAt,
  };
}

export function fromPrismaPriceCache(p: PriceCache): PriceInput {
  return {
    instrumentId: p.instrumentId,
    price: p.price.toNumber(),
    currency: p.currency,
    asOf: p.asOf,
    source: p.source,
  };
}

export function fromPrismaFxRate(r: FxRate): FxRateInput {
  return {
    base: r.base,
    quote: r.quote,
    rate: r.rate.toNumber(),
    asOf: r.asOf,
  };
}
