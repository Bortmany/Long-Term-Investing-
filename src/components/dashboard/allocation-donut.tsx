"use client";

// Allocation donut for the Dashboard's "By Sector" / "By Country" / "By
// Market" cards (UI spec §3.1). Receives plain, already-computed slices from
// the server page (Decimals converted, largest slice first, "Unknown" last) —
// this component only draws them; it never computes or invents a figure.
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { formatPercent } from "@/lib/format";
import { UNKNOWN_BUCKET } from "@/lib/portfolio/allocation";

export type DonutSlice = {
  /** Category label, e.g. "Technology", "Oman" — or "Unknown". */
  label: string;
  /** Slice size (market value in the base currency). */
  value: number;
  /** Share of the total, e.g. 34.2 means 34.2%. */
  sharePercent: number;
};

// Fixed categorical palette from UI spec §2.7, assigned largest slice first,
// cycling when there are more than six categories.
const PALETTE = [
  "#2563eb", // blue-600
  "#64748b", // slate-500
  "#60a5fa", // blue-400
  "#94a3b8", // slate-400
  "#1d4ed8", // blue-700
  "#cbd5e1", // slate-300
];

// The "Unknown" bucket is ALWAYS slate-400, whatever its position — it should
// read as "data we don't have", never as an important category (§2.7).
const UNKNOWN_COLOR = "#94a3b8";

/** Palette color per slice; "Unknown" is fixed and never consumes a palette slot. */
function colorsFor(slices: DonutSlice[]): string[] {
  let next = 0;
  return slices.map((slice) =>
    slice.label === UNKNOWN_BUCKET ? UNKNOWN_COLOR : PALETTE[next++ % PALETTE.length],
  );
}

export function AllocationDonut({ slices }: { slices: DonutSlice[] }) {
  const colors = colorsFor(slices);

  return (
    <div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="80%"
              strokeWidth={0}
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.label} fill={colors[index]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Plain-text legend below the chart (no in-chart legend, per §3.1). */}
      <ul className="mt-3 flex flex-col gap-1 text-xs">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="flex-1 truncate">{slice.label}</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {formatPercent(slice.sharePercent)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
