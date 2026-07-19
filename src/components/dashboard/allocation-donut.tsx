"use client";

// One reusable donut chart, used three times on the Dashboard (by Sector, by
// Country, by Market) — recharts is lazy-loaded via next/dynamic in the page
// so it never blocks first paint (UI spec §3.1).
//
// Palette rule (UI spec §2.7): six fixed colors, cycled if there are more
// than six categories, assigned in the order slices already come in
// (computeAllocation sorts largest-first with "Unknown" pinned last). The
// "Unknown" bucket always gets slate-400, no matter its size or position, so
// it never reads as "the most important category" — it reads as "no data".
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { UNKNOWN_BUCKET, type AllocationSlice } from "@/lib/portfolio";
import { formatMoney, formatPercent } from "@/lib/format";

const PALETTE = [
  "#2563eb", // blue-600
  "#64748b", // slate-500
  "#60a5fa", // blue-400
  "#94a3b8", // slate-400
  "#1d4ed8", // blue-700
  "#cbd5e1", // slate-300
] as const;

const UNKNOWN_COLOR = "#94a3b8"; // slate-400, fixed regardless of position/size

function colorForSlices(slices: AllocationSlice[]): string[] {
  let nonUnknownIndex = 0;
  return slices.map((slice) => {
    if (slice.label === UNKNOWN_BUCKET) return UNKNOWN_COLOR;
    const color = PALETTE[nonUnknownIndex % PALETTE.length];
    nonUnknownIndex += 1;
    return color;
  });
}

export function AllocationDonut({
  slices,
  baseCurrency,
}: {
  slices: AllocationSlice[];
  baseCurrency: string;
}) {
  const colors = colorForSlices(slices);

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            stroke="none"
          >
            {slices.map((slice, index) => (
              <Cell key={slice.label} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => [
              `${formatMoney(Number(value), baseCurrency)} (${formatPercent(
                (item?.payload as AllocationSlice | undefined)?.sharePercent ?? 0,
              )})`,
              (item?.payload as AllocationSlice | undefined)?.label ?? "",
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-col gap-1 text-xs">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-400">
              {slice.label}
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {formatPercent(slice.sharePercent)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AllocationDonut;
