// "Would this change leave a sell with nothing behind it?" — pure maths, no
// database. Used when a BUY is deleted or shrunk: the SELLs that relied on it
// would otherwise keep crediting cash the account never earned.

import type { TxnInput } from "@/lib/portfolio";

// A hair of tolerance so floating-point noise can't trip the check.
const QUANTITY_EPSILON = 1e-6;

/**
 * Given the transactions that would REMAIN after a change, return the id of the
 * first instrument whose sells now exceed its buys (and by how much), or null
 * when every position is still covered.
 */
export function findUncoveredSell(
  remaining: Pick<TxnInput, "type" | "instrumentId" | "quantity">[],
  onlyInstrumentIds?: string[],
): { instrumentId: string; bought: number; sold: number } | null {
  const totals = new Map<string, { bought: number; sold: number }>();
  for (const row of remaining) {
    if (!row.instrumentId) continue;
    if (row.type !== "BUY" && row.type !== "SELL") continue;
    const entry = totals.get(row.instrumentId) ?? { bought: 0, sold: 0 };
    const quantity = row.quantity ?? 0;
    if (row.type === "BUY") entry.bought += quantity;
    else entry.sold += quantity;
    totals.set(row.instrumentId, entry);
  }
  for (const [instrumentId, { bought, sold }] of totals) {
    if (onlyInstrumentIds && !onlyInstrumentIds.includes(instrumentId)) continue;
    if (sold > bought + QUANTITY_EPSILON) return { instrumentId, bought, sold };
  }
  return null;
}

/** Plain-English refusal shown when a buy can't be removed or shrunk. */
export function uncoveredSellMessage(
  action: "delete" | "change",
  bought: number,
  sold: number,
): string {
  return (
    `You can't ${action} this buy: after that, this account would have bought ${bought} ` +
    `share${bought === 1 ? "" : "s"} but sold ${sold}. Remove or reduce the matching ` +
    `sells first.`
  );
}
