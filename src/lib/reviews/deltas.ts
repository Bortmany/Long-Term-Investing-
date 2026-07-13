// Pure delta computation (no I/O) comparing this week's portfolio snapshot
// against the previous WeeklyReview's snapshot, so the model sees "what
// changed" rather than re-deriving it itself.
//
// DESIGN NOTE: WeeklyReview only persists the AI-authored narrative
// (`weeklyReviewSchema`'s output) plus `model`/`dataAsOf` — it does not store
// a raw total-value/allocation snapshot (mirroring the fixed schema in
// prisma/schema.prisma). So the caller (src/app/actions/reviews.ts) builds
// the "previous" snapshot's allocation from the previous review's own
// reported `allocationDrift` (category + actualPercent), and honestly passes
// `totalValue: null` for the previous snapshot since last week's raw total
// value was never captured anywhere. This function never fabricates that
// missing figure — it reports the value delta as `null` whenever either side
// is unknown, rather than guessing.
//
// GOLDEN RULE for this file:
//   (a) no previous review at all -> every delta is null (not 0, not guessed).
//   (b) a category present on one side and absent on the other is treated as
//       a genuine 0% share on the missing side (that IS the honest fact —
//       nothing was allocated there at that point), never dropped or crashed
//       on.
//   (c) a percent delta is only computed when the previous total is a real,
//       non-zero number — otherwise it is null, never a divide-by-zero NaN
//       or Infinity.

export type AllocationSlice = {
  /** e.g. a sector, country, or market label. */
  category: string;
  /** Share of the total portfolio value, 0-100. */
  percent: number;
};

export type ReviewSnapshot = {
  /** Total portfolio value in the base currency; null when genuinely unknown. */
  totalValue: number | null;
  allocation: AllocationSlice[];
};

export type AllocationDelta = {
  category: string;
  /** Null only when there is no previous review at all to compare against. */
  previousPercent: number | null;
  currentPercent: number;
  /** Null only when previousPercent is null (nothing to compare against). */
  changePercent: number | null;
};

export type ReviewDeltas = {
  /** Null when there is no previous review, or either total value is unknown. */
  totalValueDelta: number | null;
  /** Null when totalValueDelta is null, or the previous total was zero/unknown. */
  totalValuePercentDelta: number | null;
  allocationDeltas: AllocationDelta[];
};

/**
 * Compare `current` against `previous` (or `null` for a user's first-ever
 * review). Pure and deterministic — same inputs always produce the same
 * deltas, so it composes cleanly with `runAnalysis`'s input-hash reuse.
 */
export function computeReviewDeltas(
  current: ReviewSnapshot,
  previous: ReviewSnapshot | null,
): ReviewDeltas {
  if (previous === null) {
    // First-ever review for this user: honestly nothing to compare against.
    return {
      totalValueDelta: null,
      totalValuePercentDelta: null,
      allocationDeltas: current.allocation.map((slice) => ({
        category: slice.category,
        previousPercent: null,
        currentPercent: slice.percent,
        changePercent: null,
      })),
    };
  }

  const totalValueDelta =
    current.totalValue !== null && previous.totalValue !== null
      ? current.totalValue - previous.totalValue
      : null;

  const totalValuePercentDelta =
    totalValueDelta !== null &&
    previous.totalValue !== null &&
    previous.totalValue !== 0
      ? (totalValueDelta / previous.totalValue) * 100
      : null;

  const previousByCategory = new Map(
    previous.allocation.map((slice) => [slice.category, slice.percent]),
  );
  const currentByCategory = new Map(
    current.allocation.map((slice) => [slice.category, slice.percent]),
  );
  const allCategories = new Set([
    ...previousByCategory.keys(),
    ...currentByCategory.keys(),
  ]);

  const allocationDeltas: AllocationDelta[] = [...allCategories]
    .map((category) => {
      // A category missing on one side genuinely held a 0% share there —
      // that's an honest fact (nothing was allocated to it), not a guess.
      const previousPercent = previousByCategory.get(category) ?? 0;
      const currentPercent = currentByCategory.get(category) ?? 0;
      return {
        category,
        previousPercent,
        currentPercent,
        changePercent: currentPercent - previousPercent,
      };
    })
    .sort((a, b) => b.currentPercent - a.currentPercent);

  return { totalValueDelta, totalValuePercentDelta, allocationDeltas };
}
