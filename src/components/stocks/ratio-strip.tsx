// Ratio strip (ui-spec §4.2) — small stat tiles below the statements card.
// Every ratio fails INDEPENDENTLY: one missing input shows an em dash +
// "Unavailable" for that one tile only, never a fake number, and never
// blanks the rest of the strip. Plain neutral numbers — not return figures,
// so no green/red banding.
import type { RatioTile } from "./types";
import { formatPercent } from "@/lib/format";

function formatValue(tile: RatioTile): string {
  if (!tile.result.ok) return "—";
  return tile.kind === "percent"
    ? formatPercent(tile.result.value)
    : tile.result.value.toFixed(2);
}

export function RatioStrip({ tiles }: { tiles: RatioTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tile.label}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatValue(tile)}
          </p>
          {!tile.result.ok ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Unavailable
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
