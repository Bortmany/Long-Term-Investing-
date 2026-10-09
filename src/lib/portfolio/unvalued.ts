// Plain-English summary of everything that could NOT be valued or converted,
// for the amber "Some positions couldn't be valued" banner (Dashboard and
// Portfolio use the same words). Pure: no database, no screen code.
//
// Golden rule: the banner names what was left out and why; it never pads a
// total. The only two reasons the app has are "no exchange rate" and
// "no price".

import type { Currency } from "@prisma/client";
import type { MissingDividend } from "./dividends";
import type { MissingValuation } from "./value";

export type UnvaluedReason = "no exchange rate" | "no price";

export type UnvaluedItem = {
  /** What to call it on screen, e.g. "ARMCO" or "SAR cash". */
  label: string;
  reason: UnvaluedReason;
};

/**
 * "ARMCO" / "ARMCO, BKMB and EMAAR" style list. Shows the first three names,
 * then "and N more" when there are more than three.
 */
export function joinNames(names: string[]): string {
  if (names.length <= 3) {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** "1 holding" / "2 holdings". */
export function holdingsCount(count: number): string {
  return count === 1 ? "1 holding" : `${count} holdings`;
}

/**
 * Gather every left-out item across the portfolio valuation, the dividend
 * figures and the return figures, without listing the same thing twice.
 * `labelFor` turns an instrument id into a short name (its ticker).
 */
export function collectUnvaluedItems(input: {
  portfolioMissing: MissingValuation[];
  dividendMissing?: MissingDividend[];
  /** Deposits/withdrawals the return figures had to leave out. */
  returnsMissing?: { kind: "contribution" | "dividend"; currency: Currency }[];
  labelFor: (instrumentId: string) => string;
}): UnvaluedItem[] {
  const items: UnvaluedItem[] = [];
  const seen = new Set<string>();
  function add(label: string, reason: UnvaluedReason) {
    const key = `${label}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ label, reason });
  }

  for (const m of input.portfolioMissing) {
    const reason: UnvaluedReason =
      m.reason === "missing_price" ? "no price" : "no exchange rate";
    if (m.instrumentId) {
      add(input.labelFor(m.instrumentId), reason);
    } else if (m.currency) {
      add(`${m.currency} cash`, reason);
    }
  }
  for (const d of input.dividendMissing ?? []) {
    add(
      d.instrumentId ? input.labelFor(d.instrumentId) : `${d.currency} dividends`,
      "no exchange rate",
    );
  }
  for (const r of input.returnsMissing ?? []) {
    // Dividends are already named above; only add deposits/withdrawals.
    if (r.kind === "contribution") {
      add(`${r.currency} deposits and withdrawals`, "no exchange rate");
    }
  }
  return items;
}

export type UnvaluedSummary = {
  title: string;
  description: string;
  /** True when at least one item needs an exchange rate to be added. */
  needsRate: boolean;
  /** True when at least one item needs a price. */
  needsPrice: boolean;
};

/** The banner words. Returns null when nothing was left out (banner hidden). */
export function describeUnvalued(items: UnvaluedItem[]): UnvaluedSummary | null {
  if (items.length === 0) return null;
  const shown = items.slice(0, 3).map((i) => `${i.label} (${i.reason})`);
  const more = items.length > 3 ? ` and ${items.length - 3} more` : "";
  return {
    title: "Some positions couldn't be valued",
    description: `The totals below include only what could be valued. Couldn't be valued: ${shown.join(", ")}${more}.`,
    needsRate: items.some((i) => i.reason === "no exchange rate"),
    needsPrice: items.some((i) => i.reason === "no price"),
  };
}
