// Pure delta computation between two Weekly Review snapshots (BUILD-PLAN.md
// Phase 6). No I/O — the caller (src/lib/reviews/snapshot.ts) already holds
// the current, freshly-computed snapshot and whatever previous snapshot it
// found (or null, for a first-ever review); this file only compares them.
//
// GOLDEN RULE: when there is no previous snapshot, this returns
// `{ hasPrior: false }` — never a fabricated "no change" comparison.

import { z } from "zod";

/** One holding's value in a snapshot, JSON-serializable so it can be stored in WeeklyReview.output. */
export type ReviewSnapshotHolding = {
  instrumentId: string;
  ticker: string;
  /** Market value in the portfolio's base currency. */
  marketValue: number;
};

export const reviewSnapshotHoldingSchema = z.object({
  instrumentId: z.string().min(1),
  ticker: z.string().min(1),
  marketValue: z.number(),
});

/** One sector's share of holdings value in a snapshot. */
export type ReviewSectorShare = { label: string; sharePercent: number };

export const reviewSectorShareSchema = z.object({
  label: z.string().min(1),
  sharePercent: z.number(),
});

/**
 * The raw numeric snapshot persisted alongside each week's AI output, purely
 * so the FOLLOWING week's run can compute a real delta against a known prior
 * state (rather than trying to reconstruct history from whatever PriceCache/
 * FxRate rows still happen to exist a week later).
 */
export type ReviewSnapshot = {
  baseCurrency: string;
  totalValue: number;
  holdingsValue: number;
  cashValue: number;
  holdings: ReviewSnapshotHolding[];
  sectorAllocation: ReviewSectorShare[];
  /** Trailing 12-month dividend income as of this run, base currency. */
  trailingDividendIncome: number;
};

export const reviewSnapshotSchema = z.object({
  baseCurrency: z.string().min(1),
  totalValue: z.number(),
  holdingsValue: z.number(),
  cashValue: z.number(),
  holdings: z.array(reviewSnapshotHoldingSchema),
  sectorAllocation: z.array(reviewSectorShareSchema),
  trailingDividendIncome: z.number(),
});

/** One holding's value change between two snapshots — AI input only, never persisted on its own. */
export type ReviewHoldingDelta = {
  instrumentId: string;
  ticker: string;
  previousValue: number;
  currentValue: number;
  /** null when the previous value was 0 (divide-by-zero guard, never NaN/Infinity). */
  valueChangePercent: number | null;
};

/**
 * One sector's share change between two snapshots. `previousPercent: null`
 * means the sector didn't exist in the prior snapshot (a brand-new sector
 * this week) — `driftPercent` is null in that case too, rather than treating
 * "new" as a drift from an invented zero baseline.
 */
export type ReviewSectorDelta = {
  label: string;
  previousPercent: number | null;
  currentPercent: number;
  driftPercent: number | null;
};

export const reviewSectorDeltaSchema = z.object({
  label: z.string().min(1),
  previousPercent: z.number().nullable(),
  currentPercent: z.number(),
  driftPercent: z.number().nullable(),
});

export type ReviewDelta =
  | { hasPrior: false }
  | {
      hasPrior: true;
      totalValueChange: { absolute: number; percent: number | null };
      dividendIncomeChange: number;
      newHoldings: { instrumentId: string; ticker: string; currentValue: number }[];
      droppedHoldings: { instrumentId: string; ticker: string; previousValue: number }[];
      changedHoldings: ReviewHoldingDelta[];
      sectorAllocation: ReviewSectorDelta[];
    };

/**
 * Compare `current` against `previous` (or say honestly there is nothing to
 * compare against, for the first review). Every percentage here guards
 * divide-by-zero with a typed `null` rather than NaN/Infinity — same
 * discipline as src/lib/portfolio/returns.ts.
 */
export function computeReviewDelta(
  current: ReviewSnapshot,
  previous: ReviewSnapshot | null,
): ReviewDelta {
  if (!previous) return { hasPrior: false };

  const totalAbsolute = current.totalValue - previous.totalValue;
  const totalPercent =
    previous.totalValue !== 0 ? (totalAbsolute / previous.totalValue) * 100 : null;

  const previousByInstrument = new Map(previous.holdings.map((h) => [h.instrumentId, h]));
  const currentByInstrument = new Map(current.holdings.map((h) => [h.instrumentId, h]));

  const newHoldings = current.holdings
    .filter((h) => !previousByInstrument.has(h.instrumentId))
    .map((h) => ({ instrumentId: h.instrumentId, ticker: h.ticker, currentValue: h.marketValue }));

  const droppedHoldings = previous.holdings
    .filter((h) => !currentByInstrument.has(h.instrumentId))
    .map((h) => ({ instrumentId: h.instrumentId, ticker: h.ticker, previousValue: h.marketValue }));

  const changedHoldings: ReviewHoldingDelta[] = current.holdings
    .filter((h) => previousByInstrument.has(h.instrumentId))
    .map((h) => {
      const prior = previousByInstrument.get(h.instrumentId)!;
      const valueChangePercent =
        prior.marketValue !== 0
          ? ((h.marketValue - prior.marketValue) / prior.marketValue) * 100
          : null;
      return {
        instrumentId: h.instrumentId,
        ticker: h.ticker,
        previousValue: prior.marketValue,
        currentValue: h.marketValue,
        valueChangePercent,
      };
    });

  const previousSectorByLabel = new Map(
    previous.sectorAllocation.map((s) => [s.label, s.sharePercent]),
  );
  const currentSectorLabels = new Set(current.sectorAllocation.map((s) => s.label));

  const sectorAllocation: ReviewSectorDelta[] = current.sectorAllocation.map((s) => {
    const prev = previousSectorByLabel.get(s.label) ?? null;
    return {
      label: s.label,
      previousPercent: prev,
      currentPercent: s.sharePercent,
      driftPercent: prev === null ? null : s.sharePercent - prev,
    };
  });
  // A sector that existed last week but has vanished entirely this week
  // (e.g. sold out of it) is still a real drift, worth surfacing, not
  // silently dropped from the list just because it has no "current" row.
  for (const [label, prevPercent] of previousSectorByLabel) {
    if (!currentSectorLabels.has(label)) {
      sectorAllocation.push({
        label,
        previousPercent: prevPercent,
        currentPercent: 0,
        driftPercent: 0 - prevPercent,
      });
    }
  }

  return {
    hasPrior: true,
    totalValueChange: { absolute: totalAbsolute, percent: totalPercent },
    dividendIncomeChange: current.trailingDividendIncome - previous.trailingDividendIncome,
    newHoldings,
    droppedHoldings,
    changedHoldings,
    sectorAllocation,
  };
}
