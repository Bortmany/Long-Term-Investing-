// Concentration math for the Portfolio Health Score (pure, no I/O).
//
// The caller converts Prisma Decimals to plain numbers at the edge (via the
// fromPrisma* adapters) and passes ALREADY-VALUED market values in one common
// currency (the portfolio base currency). Nothing here reads a database or
// touches a Decimal.
//
// SCALE CONVENTION (documented once, used everywhere in this file):
//   HHI (Herfindahl-Hirschman Index) is returned on the [0, 1] FRACTIONAL
//   scale — each position's share is value / total (a fraction that sums to
//   1 across all positions), and HHI = Σ(share²). Consequences of that scale:
//     - a single position (fully concentrated)      → HHI = 1
//     - N positions of equal size (perfectly spread) → HHI = 1/N
//     - so HHI always sits in (0, 1]; smaller = more diversified.
//   (This is the fraction scale, NOT the 0–10000 "percent-squared" scale some
//   references use. Multiply by 10000 if a percent-scale HHI is ever needed.)
//
// EMPTY / NO-VALUE CASE: with no positions, or a total value of zero, HHI is
// not a meaningful number — there is nothing to be concentrated in. Rather
// than return a fabricated 0 (which would read as "perfectly diversified"),
// these functions return `null`, a typed "not applicable" the caller passes
// through honestly to the AI payload (never padded with a fake figure).
//
// NULL-SECTOR HANDLING: a holding whose instrument has no sector is bucketed
// as "Unknown" for the sector HHI — the SAME treatment the dashboard
// allocation donuts give null sectors (ui-spec §2.7 / computeAllocation's
// UNKNOWN_BUCKET). It is a real bucket that competes for share, not dropped.

import { UNKNOWN_BUCKET } from "./allocation";

/** One valued position: its market value (base currency) and its sector. */
export type ConcentrationHolding = {
  /** Market value in the portfolio base currency (already converted). */
  value: number;
  /** Instrument sector, or null when the instrument has no sector tag. */
  sector: string | null;
};

/** The concentration figures fed into the Health Score pre-computation. */
export type ConcentrationMetrics = {
  /** How many valued positions the figures are based on. */
  holdingCount: number;
  /** Position-level HHI on the [0,1] scale, or null when there is nothing to value. */
  hhi: number | null;
  /** Largest single position's share on the [0,1] scale, or null when empty. */
  topHoldingWeight: number | null;
  /** Sector-level HHI on the [0,1] scale (null sectors bucketed as "Unknown"), or null when empty. */
  sectorHhi: number | null;
};

/**
 * Herfindahl-Hirschman Index over a set of non-negative values, on the [0,1]
 * fractional scale (see the scale convention at the top of this file).
 * Returns null for an empty list or a total of zero (typed "not applicable" —
 * never a fabricated 0).
 */
export function computeHhi(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;

  let hhi = 0;
  for (const value of values) {
    const share = value / total;
    hhi += share * share;
  }
  return hhi;
}

/**
 * The largest single position's share of the total, on the [0,1] scale.
 * Returns null for an empty list or a total of zero.
 */
export function computeTopHoldingWeight(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;

  const largest = Math.max(...values);
  return largest / total;
}

/**
 * Sector-level HHI on the [0,1] scale. Holdings are summed into sector
 * buckets first (null sectors → the "Unknown" bucket, matching the allocation
 * donuts), then the HHI is taken over the bucket totals. Returns null when
 * there is nothing to value.
 */
export function computeSectorHhi(holdings: ConcentrationHolding[]): number | null {
  if (holdings.length === 0) return null;

  const bySector = new Map<string, number>();
  for (const holding of holdings) {
    const label = holding.sector ?? UNKNOWN_BUCKET;
    bySector.set(label, (bySector.get(label) ?? 0) + holding.value);
  }

  return computeHhi([...bySector.values()]);
}

/**
 * All concentration figures in one pass — position HHI, top-holding weight,
 * and sector HHI — for the Health Score pre-computation. Each is on the
 * documented [0,1] scale, or null when there is nothing to value.
 */
export function computeConcentration(
  holdings: ConcentrationHolding[],
): ConcentrationMetrics {
  const values = holdings.map((holding) => holding.value);
  return {
    holdingCount: holdings.length,
    hhi: computeHhi(values),
    topHoldingWeight: computeTopHoldingWeight(values),
    sectorHhi: computeSectorHhi(holdings),
  };
}
