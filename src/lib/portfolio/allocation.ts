// Allocation slices for the sector / country / market donut charts.
//
// Pure: takes holdings that were ALREADY valued in the base currency
// (only pass holdings whose valuation succeeded — anything unvalued belongs
// in the portfolio's `missing` list, never silently in a chart).
//
// Instruments with a null sector/country go into an "Unknown" bucket, which
// always sorts last. Market is a required enum, so a market allocation never
// has an Unknown bucket.

import type { Market } from "@prisma/client";

export const UNKNOWN_BUCKET = "Unknown";

export type AllocationKey = "sector" | "country" | "market";

/** One valued holding plus the instrument metadata the slices group by. */
export type AllocatableHolding = {
  instrumentId: string;
  /** Market value in the portfolio base currency. */
  marketValue: number;
  sector: string | null;
  country: string | null;
  market: Market;
};

export type AllocationSlice = {
  /** Category label, e.g. "Technology", "Oman", "US" — or "Unknown". */
  label: string;
  /** Total market value of this slice, in the base currency. */
  value: number;
  /** Share of the total as a percentage (e.g. 34.2 means 34.2%). */
  sharePercent: number;
};

export type Allocation = {
  key: AllocationKey;
  /** Sum of all slice values. */
  total: number;
  /** Sorted largest-first; the "Unknown" bucket (if any) is always last. */
  slices: AllocationSlice[];
};

/**
 * Group valued holdings into allocation slices by sector, country or market.
 * Returns an empty slice list for an empty portfolio (never NaN shares).
 */
export function computeAllocation(
  holdings: AllocatableHolding[],
  key: AllocationKey,
): Allocation {
  const byLabel = new Map<string, number>();

  for (const holding of holdings) {
    const raw =
      key === "sector"
        ? holding.sector
        : key === "country"
          ? holding.country
          : holding.market;
    const label = raw ?? UNKNOWN_BUCKET;
    byLabel.set(label, (byLabel.get(label) ?? 0) + holding.marketValue);
  }

  const total = [...byLabel.values()].reduce((sum, v) => sum + v, 0);

  const slices: AllocationSlice[] = [...byLabel.entries()]
    .map(([label, value]) => ({
      label,
      value,
      // Guard divide-by-zero: an all-zero portfolio reports 0% shares.
      sharePercent: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => {
      // "Unknown" always sinks to the bottom, whatever its size.
      if (a.label === UNKNOWN_BUCKET && b.label !== UNKNOWN_BUCKET) return 1;
      if (b.label === UNKNOWN_BUCKET && a.label !== UNKNOWN_BUCKET) return -1;
      if (b.value !== a.value) return b.value - a.value;
      return a.label.localeCompare(b.label);
    });

  return { key, total, slices };
}
