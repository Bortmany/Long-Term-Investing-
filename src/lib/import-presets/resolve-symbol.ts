// Broker ticker -> the stock the person already tracks.
//
// Pure: works only from the tracked instruments it is handed. A broker's
// "2222" matches a tracked "2222.SR" only when the broker also named the
// market and that instrument is on it. Nothing is invented: a ticker that is
// not tracked stays unresolved, and the person is told to track it first.

import type {
  CannotReadRow,
  ReadyRow,
  RowOutcome,
  TrackedInstrument,
} from "./types";

export type ResolveOutcome =
  | { kind: "matched"; ticker: string; market: string }
  /** Tracked on several markets and no market was named: the shared check explains. */
  | { kind: "ambiguous" }
  | { kind: "untracked" };

function up(s: string): string {
  return s.trim().toUpperCase();
}

/** True when `tracked` is `<brokerTicker>.<suffix>` (e.g. 2222.SR for 2222). */
function isSuffixForm(tracked: string, brokerTicker: string): boolean {
  return up(tracked).startsWith(`${brokerTicker}.`);
}

export function resolveBrokerSymbol(
  brokerTicker: string,
  marketHint: string | undefined,
  instruments: TrackedInstrument[],
): ResolveOutcome {
  const wanted = up(brokerTicker);
  if (wanted === "") return { kind: "untracked" };
  const hint = marketHint ? up(marketHint) : undefined;

  if (hint) {
    const exact = instruments.filter((i) => up(i.ticker) === wanted && up(i.market) === hint);
    if (exact.length === 1) return { kind: "matched", ticker: exact[0].ticker, market: exact[0].market };
    const suffix = instruments.filter((i) => up(i.market) === hint && isSuffixForm(i.ticker, wanted));
    if (suffix.length === 1) return { kind: "matched", ticker: suffix[0].ticker, market: suffix[0].market };
    if (exact.length + suffix.length > 1) return { kind: "ambiguous" };
    return { kind: "untracked" };
  }

  const exact = instruments.filter((i) => up(i.ticker) === wanted);
  if (exact.length === 1) return { kind: "matched", ticker: exact[0].ticker, market: exact[0].market };
  if (exact.length > 1) return { kind: "ambiguous" };
  return { kind: "untracked" };
}

/**
 * Turn the broker's ticker text in each ready row into the tracked ticker and
 * market. A ticker that is not tracked becomes a "cannot read" row with the
 * shared validation's plain wording, flagged so the screen can gather them
 * into one "Track these first" line. Cash rows have no ticker and pass
 * through. Order and line numbers are kept.
 */
export function resolveRows<T extends RowOutcome>(
  rows: T[],
  instruments: TrackedInstrument[],
): { rows: RowOutcome[]; untrackedTickers: string[] } {
  const untracked: string[] = [];
  const out: RowOutcome[] = rows.map((row) => {
    if (row.kind !== "ready") return row;
    const { type, ticker, market } = row.mapped;
    if (!ticker || type === "DEPOSIT" || type === "WITHDRAWAL") return row;
    const r = resolveBrokerSymbol(ticker, market, instruments);
    if (r.kind === "matched") {
      const resolved: ReadyRow = {
        ...row,
        mapped: { ...row.mapped, ticker: r.ticker, market: r.market },
      };
      return resolved;
    }
    if (r.kind === "ambiguous") {
      // Leave the ticker as written with no market: the shared check reports
      // "exists on more than one market" in its own words.
      const { market: _dropped, ...rest } = row.mapped;
      void _dropped;
      const passed: ReadyRow = { ...row, mapped: { ...rest, ticker: up(ticker) } };
      return passed;
    }
    const name = up(ticker);
    if (!untracked.includes(name)) untracked.push(name);
    const failed: CannotReadRow = {
      kind: "cannot_read",
      line: row.line,
      raw: row.raw,
      ...(row.file ? { file: row.file } : {}),
      reason: `Unknown ticker '${ticker}' — check spelling or track it first.`,
      untrackedTicker: name,
    };
    return failed;
  });
  return { rows: out, untrackedTickers: untracked };
}
