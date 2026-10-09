// Decides what the Dividend Income figures wear: the clean "Computed from
// your transactions" badge, or an amber warning.
//
// GOLDEN RULE: a figure that had to leave something out must NEVER wear the
// clean badge. The badge is shown only when the total, the monthly chart and
// Income by Holding are all complete; otherwise the warning names the
// holdings that were left out. Pure: no database, no screen code.

import type { MissingDividend } from "./dividends";
import { joinNames } from "./unvalued";

export type DividendCardState =
  | {
      kind: "badge";
      /** The badge props: computed purely from the user's transactions. */
      badge: { variant: "derived" };
    }
  | {
      kind: "warning";
      /** Number of holdings left out. */
      count: number;
      /** Short line that replaces the badge: "Excludes 1 holding: no exchange rate." */
      title: string;
      /** Longer sentence naming the holdings and the base currency. */
      description: string;
      /** Hover/tap hint for the compact line on the summary card. */
      hint: string;
      /** Names of the holdings left out. */
      holdings: string[];
    };

/** "Excludes 1 holding: no exchange rate." / "Excludes 2 holdings: …" */
export function dividendWarningTitle(count: number): string {
  return `Excludes ${count} ${count === 1 ? "holding" : "holdings"}: no exchange rate.`;
}

/**
 * Decide badge vs warning from the three dividend figures' `missing` lists
 * (headline total, monthly chart, income by holding).
 * `labelFor` turns an instrument id into a short name (its ticker).
 */
export function decideDividendCard(input: {
  baseCurrency: string;
  income: { missing: MissingDividend[] };
  monthly: { missing: MissingDividend[] };
  byHolding: { missing: MissingDividend[] };
  labelFor: (instrumentId: string) => string;
}): DividendCardState {
  const all = [
    ...input.income.missing,
    ...input.monthly.missing,
    ...input.byHolding.missing,
  ];
  if (all.length === 0) {
    return { kind: "badge", badge: { variant: "derived" } };
  }

  // One name per holding left out (a dividend with no holding is named by
  // its currency, so it is still counted and never hidden).
  const names: string[] = [];
  const seen = new Set<string>();
  for (const m of all) {
    const name = m.instrumentId ? input.labelFor(m.instrumentId) : `${m.currency} dividends`;
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return {
    kind: "warning",
    count: names.length,
    title: dividendWarningTitle(names.length),
    description: `Dividends from ${joinNames(names)} couldn't be converted to ${input.baseCurrency}, so they are left out of the total, the chart and Income by Holding.`,
    hint: "These dividends couldn't be turned into your base currency, so they are not in this total. Names are in the Dividend Income card below.",
    holdings: names,
  };
}
